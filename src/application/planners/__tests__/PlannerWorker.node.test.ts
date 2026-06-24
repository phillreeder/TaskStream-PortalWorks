import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { type TestContext } from 'node:test';
import { StreamStateModule } from '../../../modules/StreamState/index.js';
import { SystemTraceRecorder } from '../../../modules/SystemTrace/index.js';
import { SqlSystemTraceAdapter, SqlSystemTraceQueryRepository } from '../../../modules/SystemTrace/sqlTracePersistence.js';
import { TenantProcessExplorer } from '../../../infrastructure/tenant-process/TenantProcessExplorer.js';
import { TenantProcessLoader } from '../../../infrastructure/tenant-process/TenantProcessLoader.js';
import { TenantProcessLoadParameterStore } from '../../../infrastructure/tenant-process/TenantProcessLoadParameterStore.js';
import { SqliteTaskStorageGateway } from '../../../infrastructure/task-storage/SqliteTaskStorageGateway.js';
import { TaskStorageExecutionWorkPublisher } from '../../../infrastructure/execution/TaskStorageExecutionWorkPublisher.js';
import { SqliteStreamStateStore } from '../../../infrastructure/state/SqliteStreamStateStore.js';
import { StreamStatePlanningProvider } from '../../../infrastructure/state/StreamStatePlanningProvider.js';
import { PlannerWorker } from '../PlannerWorker.js';

function createHarness(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), 'taskstream-planner-worker-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const databasePath = join(directory, 'tasks.sqlite');
  const gateway = new SqliteTaskStorageGateway(databasePath, {
    defaultTenantProcessId: 'TaskStream/Test1',
    defaultTaskRef: 'processWork',
    isTenantProcessRegistered: (tenantProcessId) => tenantProcessId === 'TaskStream/Test1',
  });
  const traceAdapter = new SqlSystemTraceAdapter(databasePath);
  const streamStateStore = new SqliteStreamStateStore(databasePath);
  const streamStateProvider = new StreamStatePlanningProvider(
    new StreamStateModule(streamStateStore),
  );
  const traceRecorder = new SystemTraceRecorder({ adapter: traceAdapter });
  const traceRepository = new SqlSystemTraceQueryRepository(databasePath);
  t.after(() => gateway.close());
  t.after(() => traceAdapter.close());
  t.after(() => streamStateStore.close());
  t.after(() => traceRepository.close());
  return { gateway, traceRecorder, traceRepository, streamStateStore, streamStateProvider };
}

test('PlannerWorker dispatches Task activation before Stream Channel planning', async (t) => {
  const {
    gateway,
    traceRecorder,
    traceRepository,
    streamStateStore,
    streamStateProvider,
  } = createHarness(t);
  const created = await gateway.createTask({ data: { name: 'Dispatch governed work' } });
  const streamId = 'stream-instance-7';
  const parameters = new TenantProcessLoadParameterStore();
  const explorer = new TenantProcessExplorer(fileURLToPath(new URL('../../../../Tenants/', import.meta.url)), parameters);
  await explorer.discover();
  const loader = new TenantProcessLoader(parameters);
  const worker = new PlannerWorker(
    'worker-1',
    gateway,
    new TaskStorageExecutionWorkPublisher(gateway),
    explorer,
    loader,
    streamStateProvider,
    traceRecorder,
  );

  const activationResult = await worker.runOnce();
  let workEntries = await gateway.listProcessWorkEntries();
  assert.equal(activationResult?.status, 'completed');
  assert.equal(workEntries.length, 1);
  assert.equal(workEntries[0]?.workType, 'task-activation');
  assert.equal(workEntries[0]?.channelId, 'task.activation');
  assert.equal(workEntries[0]?.flowId, 'processWork.activation');
  assert.equal(workEntries[0]?.payload.planningEvidence, undefined);
  assert.equal(workEntries[0]?.payload.streamId, undefined);

  await streamStateStore.saveAuthoritativeState({
    streamKey: streamId,
    version: 4,
    state: {
      status: 'prepared',
      sourceEventId: 'prior-event',
      sourceQueueItemId: '',
      workEntryId: '',
      lastError: '',
    },
    updatedAt: new Date(500).toISOString(),
  });
  await gateway.recordEvent({
    eventType: 'stream.ready',
    sourceEntityType: 'Stream',
    sourceEntityId: streamId,
    payload: {
      streamId,
      sourceTaskId: created.id,
      taskRef: 'processWork',
      taskName: 'Dispatch governed work',
      tenantProcessId: 'TaskStream/Test1',
    },
  });

  const streamResult = await worker.runOnce();
  const finalRun = await worker.runOnce();
  workEntries = await gateway.listProcessWorkEntries();
  const queueItems = await gateway.listPersistentQueueItems();
  const traceRecords = traceRepository.list();

  assert.equal(streamResult?.status, 'completed');
  assert.equal(finalRun, null);
  assert.equal(queueItems.length, 2);
  assert.ok(queueItems.every((item) => item.status === 'completed'));
  assert.equal(workEntries.length, 2);
  assert.equal(workEntries[1]?.tenantProcessId, 'TaskStream/Test1');
  assert.equal(workEntries[1]?.channelId, 'processWork');
  assert.equal(workEntries[1]?.flowId, 'inspectWork');
  assert.equal(workEntries[1]?.workType, 'process-channel-result');
  assert.equal(workEntries[1]?.payload.streamId, streamId);
  const planningEvidence = workEntries[1]?.payload.planningEvidence as {
    streamKey: string;
    authoritativeVersion: number;
    effectiveVersion: number;
    stateSnapshot: Record<string, unknown>;
  };
  assert.equal(planningEvidence.streamKey, streamId);
  assert.notEqual(planningEvidence.streamKey, created.id);
  assert.equal(planningEvidence.authoritativeVersion, 4);
  assert.equal(planningEvidence.effectiveVersion, 4);
  assert.equal(planningEvidence.stateSnapshot.status, 'prepared');
  assert.equal((await streamStateStore.getAuthoritativeState(streamId))?.version, 4);

  const operations = traceRecords.map((record) => record.operation);
  assert.ok(operations.includes('planner.task-activation.prepared'));
  assert.ok(operations.includes('planner.channel.entered'));
  assert.equal(operations.filter((operation) => operation === 'planner.execution-work.published').length, 2);
  assert.equal(operations.filter((operation) => operation === 'planner.queue-item.completed').length, 2);
  assert.ok(!operations.includes('planner.queue-item.failed'));
});
