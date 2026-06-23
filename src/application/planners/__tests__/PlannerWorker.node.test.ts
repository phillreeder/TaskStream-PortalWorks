import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { type TestContext } from 'node:test';
import { SystemTraceRecorder } from '../../../modules/SystemTrace/index.js';
import { SqlSystemTraceAdapter, SqlSystemTraceQueryRepository } from '../../../modules/SystemTrace/sqlTracePersistence.js';
import { TenantProcessExplorer } from '../../../infrastructure/tenant-process/TenantProcessExplorer.js';
import { TenantProcessLoader } from '../../../infrastructure/tenant-process/TenantProcessLoader.js';
import { TenantProcessLoadParameterStore } from '../../../infrastructure/tenant-process/TenantProcessLoadParameterStore.js';
import { SqliteTaskStorageGateway } from '../../../infrastructure/task-storage/SqliteTaskStorageGateway.js';
import { TaskStorageExecutionWorkPublisher } from '../../../infrastructure/execution/TaskStorageExecutionWorkPublisher.js';
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
  const traceRecorder = new SystemTraceRecorder({ adapter: traceAdapter });
  const traceRepository = new SqlSystemTraceQueryRepository(databasePath);
  t.after(() => gateway.close());
  t.after(() => traceAdapter.close());
  t.after(() => traceRepository.close());
  return { gateway, traceRecorder, traceRepository };
}

test('[tickets: POC-TENANTPROCESS-EXECUTION-DISPATCH-001] PlannerWorker dispatches validated TenantProcess work and completes planning', async (t) => {
  const { gateway, traceRecorder, traceRepository } = createHarness(t);
  const created = await gateway.createTask({ data: { name: 'Dispatch governed work' } });
  const parameters = new TenantProcessLoadParameterStore();
  const explorer = new TenantProcessExplorer(fileURLToPath(new URL('../../../../Tenants/', import.meta.url)), parameters);
  await explorer.discover();
  const loader = new TenantProcessLoader(parameters);
  const worker = new PlannerWorker('worker-1', gateway, new TaskStorageExecutionWorkPublisher(gateway), explorer, loader, traceRecorder);

  const result = await worker.runOnce();
  const workEntries = await gateway.listProcessWorkEntries();
  const events = await gateway.listEvents();
  const queueItems = await gateway.listPersistentQueueItems();
  const traceRecords = traceRepository.list();
  const secondRun = await worker.runOnce();

  assert.equal(result?.status, 'completed');
  assert.equal(secondRun, null);
  assert.equal(events[0]?.eventType, 'task.created');
  assert.equal(events[0]?.sourceEntityId, created.id);
  assert.equal(queueItems[0]?.status, 'completed');
  assert.equal(queueItems[0]?.claimedBy, 'worker-1');
  assert.equal(queueItems[0]?.sourceTaskId, created.id);
  assert.equal(queueItems[0]?.taskRef, 'processWork');
  assert.equal(queueItems[0]?.taskName, 'Dispatch governed work');
  assert.ok(queueItems[0]?.completedAt);
  assert.equal(queueItems[0]?.failedAt, null);
  assert.equal(queueItems[0]?.lastError, null);
  assert.equal(workEntries.length, 1);
  assert.equal(workEntries[0]?.tenantProcessId, 'TaskStream/Test1');
  assert.equal(workEntries[0]?.channelId, 'processWork');
  assert.equal(workEntries[0]?.flowId, 'prepareWork');
  assert.equal(workEntries[0]?.status, 'queued');
  assert.equal(workEntries[0]?.sourceQueueItemId, queueItems[0]?.id);

  const operations = traceRecords.map((record) => record.operation);
  assert.deepEqual(operations, [
    'planner.queue-item.claimed',
    'planner.tenantprocess.discovery.started',
    'planner.tenantprocess.discovery.completed',
    'planner.tenantprocess.loading.started',
    'planner.tenantprocess.loaded',
    'planner.tenantprocess.resolved',
    'planner.channel.entered',
    'planner.execution-work.published',
    'planner.queue-item.completed',
  ]);
  assert.ok(!operations.includes('planner.tenantprocess.execution.failed'));
  assert.ok(!operations.includes('planner.queue-item.failed'));
});
