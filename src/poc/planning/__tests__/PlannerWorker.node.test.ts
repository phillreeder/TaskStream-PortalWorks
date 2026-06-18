import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { type TestContext } from 'node:test';
import { SqliteTaskStorageGateway } from '../../../tenants/IEBBeta/TenantProcesses/Test1/task-storage/SqliteTaskStorageGateway.js';
import { PlannerWorker, type ProcessChannelPlanner } from '../PlannerWorker.js';

function createGateway(t: TestContext): SqliteTaskStorageGateway {
  const directory = mkdtempSync(join(tmpdir(), 'taskstream-planner-worker-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const gateway = new SqliteTaskStorageGateway(join(directory, 'tasks.sqlite'));
  t.after(() => gateway.close());
  return gateway;
}

test('[tickets: POC-EVENT-WORKER-001] materializes one real work entry from a claimed queue item', async (t) => {
  const gateway = createGateway(t);
  const created = await gateway.createTask({ data: { name: 'Worker lifecycle' } });
  const plannerCalls: Array<{ eventType: string; queueItemId: string }> = [];
  const planner: ProcessChannelPlanner = {
    async executeProcessChannel({ event, queueItem }) {
      plannerCalls.push({ eventType: event.eventType, queueItemId: queueItem.id });
      return { processAction: 'process-channel-outcome-pending-flow-decision' };
    },
  };
  const worker = new PlannerWorker('worker-1', gateway, planner);

  const completed = await worker.runOnce();
  const workEntries = await gateway.listProcessWorkEntries();
  const events = await gateway.listEvents();
  const queueItems = await gateway.listPersistentQueueItems();
  const secondRun = await worker.runOnce();

  assert.equal(completed?.status, 'completed');
  assert.equal(secondRun, null);
  assert.deepEqual(plannerCalls, [{ eventType: 'task.created', queueItemId: completed?.id ?? '' }]);
  assert.equal(events[0]?.eventType, 'task.created');
  assert.equal(events[0]?.sourceEntityId, created.id);
  assert.equal(queueItems[0]?.status, 'completed');
  assert.equal(workEntries.length, 1);
  assert.equal(workEntries[0]?.sourceEventId, events[0]?.id);
  assert.equal(workEntries[0]?.sourceQueueItemId, completed?.id);
  assert.equal(workEntries[0]?.workType, 'process-channel-result');
  assert.equal(workEntries[0]?.status, 'materialized');
  assert.equal(workEntries[0]?.payload.processAction, 'process-channel-outcome-pending-flow-decision');
  assert.equal(workEntries[0]?.payload.unresolvedDownstreamAction, 'start-flow-or-process-flow-undecided');
});

test('[tickets: POC-EVENT-WORKER-001] worker fails the queue item when processing fails', async (t) => {
  const gateway = createGateway(t);
  await gateway.createTask({ data: { name: 'Worker failure' } });
  const worker = new PlannerWorker('worker-1', gateway, {
    async executeProcessChannel() {
      throw new Error('planner exploded');
    },
  });

  await assert.rejects(() => worker.runOnce(), /planner exploded/u);
  const queueItems = await gateway.listPersistentQueueItems();
  const workEntries = await gateway.listProcessWorkEntries();

  assert.equal(queueItems[0]?.status, 'failed');
  assert.equal(queueItems[0]?.lastError, 'planner exploded');
  assert.equal(workEntries.length, 0);
});
