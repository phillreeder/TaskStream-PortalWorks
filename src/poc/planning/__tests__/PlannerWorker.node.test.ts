import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { type TestContext } from 'node:test';
import { POC_TENANT_PROCESS_IDS } from '../../tenant-process/PocTenantProcess.js';
import { SqliteTaskStorageGateway } from '../../tenant-process/Test1/task-storage/SqliteTaskStorageGateway.js';
import { PlannerWorker, type ProcessChannelPlanner } from '../PlannerWorker.js';

function createGateway(t: TestContext): SqliteTaskStorageGateway {
  const directory = mkdtempSync(join(tmpdir(), 'taskstream-planner-worker-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const gateway = new SqliteTaskStorageGateway(join(directory, 'tasks.sqlite'));
  t.after(() => gateway.close());
  return gateway;
}

test('[tickets: POC-TENANT-WORK-LOG-001] invokes a registered POC TenantProcess before creating real work', async (t) => {
  const gateway = createGateway(t);
  const created = await gateway.createTask({ data: { name: 'Worker lifecycle' } });
  const worker = new PlannerWorker('worker-1', gateway);

  const completed = await worker.runOnce();
  const workEntries = await gateway.listProcessWorkEntries();
  const events = await gateway.listEvents();
  const queueItems = await gateway.listPersistentQueueItems();
  const traceRecords = await gateway.listSystemTraceRecords();
  const secondRun = await worker.runOnce();

  assert.equal(completed?.status, 'completed');
  assert.equal(secondRun, null);
  assert.equal(events[0]?.eventType, 'task.created');
  assert.equal(events[0]?.sourceEntityId, created.id);
  assert.equal(queueItems[0]?.status, 'completed');
  assert.equal(workEntries.length, 1);
  assert.equal(workEntries[0]?.sourceEventId, events[0]?.id);
  assert.equal(workEntries[0]?.sourceQueueItemId, completed?.id);
  assert.equal(workEntries[0]?.tenantProcessId, POC_TENANT_PROCESS_IDS.tenantProcessId);
  assert.equal(workEntries[0]?.channelId, POC_TENANT_PROCESS_IDS.channelId);
  assert.equal(workEntries[0]?.flowId, POC_TENANT_PROCESS_IDS.flowId);
  assert.ok(workEntries[0]?.executionId);
  assert.equal(workEntries[0]?.workType, 'process-channel-result');
  assert.equal(workEntries[0]?.status, 'materialized');
  assert.equal(workEntries[0]?.payload.processAction, 'process-channel-outcome-pending-flow-decision');
  assert.equal(workEntries[0]?.payload.unresolvedDownstreamAction, 'start-flow-or-process-flow-undecided');
  assert.deepEqual(
    traceRecords.map((record) => record.operation),
    [
      'poc.task.event.persisted',
      'poc.event-reaction.selected',
      'poc.queue-item.created',
      'poc.planner.queue-item.claimed',
      'poc.planner.tenantprocess.resolution.started',
      'poc.planner.tenantprocess.resolved',
      'poc.planner.tenantprocess.invocation.started',
      'poc.tenantprocess.invocation.started',
      'poc.tenantprocess.channel.entered',
      'poc.tenantprocess.flow.entered',
      'poc.tenantprocess.work-materialization.started',
      'poc.tenantprocess.work-entry.confirmed',
      'poc.tenantprocess.invocation.completed',
      'poc.planner.queue-item.completed',
    ],
  );
});

test('[tickets: POC-TENANT-WORK-LOG-001] prevents planner worker direct work materialization', async (t) => {
  const gateway = createGateway(t);
  await gateway.createTask({ data: { name: 'No direct work' } });
  const runtime: ProcessChannelPlanner = {
    resolve() {
      return {};
    },
    async invokeProcessChannel() {
      return { workEntry: { id: 'fake-work-entry' } };
    },
  };
  const worker = new PlannerWorker('worker-1', gateway, runtime);

  await assert.rejects(() => worker.runOnce(), /did not durably create work entry/u);
  const queueItems = await gateway.listPersistentQueueItems();
  const workEntries = await gateway.listProcessWorkEntries();

  assert.equal(queueItems[0]?.status, 'failed');
  assert.equal(workEntries.length, 0);
});

test('[tickets: POC-TENANT-WORK-LOG-001] records failed TenantProcess stage without false completion', async (t) => {
  const gateway = createGateway(t);
  await gateway.createTask({ data: { name: 'Worker failure' } });
  const runtime: ProcessChannelPlanner = {
    resolve() {
      return {};
    },
    async invokeProcessChannel() {
      throw new Error('tenant process exploded');
    },
  };
  const worker = new PlannerWorker('worker-1', gateway, runtime);

  await assert.rejects(() => worker.runOnce(), /tenant process exploded/u);
  const queueItems = await gateway.listPersistentQueueItems();
  const workEntries = await gateway.listProcessWorkEntries();
  const traceRecords = await gateway.listSystemTraceRecords();

  assert.equal(queueItems[0]?.status, 'failed');
  assert.equal(queueItems[0]?.lastError, 'tenant process exploded');
  assert.equal(workEntries.length, 0);
  assert.equal(traceRecords.at(-1)?.operation, 'poc.planner.failure');
  assert.equal(traceRecords.at(-1)?.status, 'error');
});

test('[tickets: POC-TENANT-WORK-LOG-001] TenantProcess work materialization is idempotent for one queue item', async (t) => {
  const gateway = createGateway(t);
  await gateway.createTask({ data: { name: 'Idempotent work' } });
  const queueItem = (await gateway.listPersistentQueueItems())[0];
  const worker = new PlannerWorker('worker-1', gateway);

  await worker.runOnce();
  const firstWorkEntries = await gateway.listProcessWorkEntries();
  await gateway.createProcessWorkEntry({
    sourceEventId: queueItem.sourceEventId,
    sourceQueueItemId: queueItem.id,
    tenantProcessId: POC_TENANT_PROCESS_IDS.tenantProcessId,
    channelId: POC_TENANT_PROCESS_IDS.channelId,
    flowId: POC_TENANT_PROCESS_IDS.flowId,
    executionId: 'duplicate-execution',
    workType: 'process-channel-result',
    status: 'materialized',
    payload: { duplicate: true },
  });
  const secondWorkEntries = await gateway.listProcessWorkEntries();

  assert.equal(firstWorkEntries.length, 1);
  assert.equal(secondWorkEntries.length, 1);
  assert.equal(secondWorkEntries[0]?.id, firstWorkEntries[0]?.id);
});
