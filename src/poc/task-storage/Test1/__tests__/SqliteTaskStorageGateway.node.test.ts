import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { type TestContext } from 'node:test';
import { SqliteTaskStorageGateway } from '../SqliteTaskStorageGateway.js';

function createGateway(t: TestContext): SqliteTaskStorageGateway {
  const directory = mkdtempSync(join(tmpdir(), 'taskstream-task-gateway-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const gateway = new SqliteTaskStorageGateway(join(directory, 'tasks.sqlite'), {
    defaultTenantProcessId: 'TaskStream/Test1',
    isTenantProcessRegistered: (tenantProcessId) => tenantProcessId === 'TaskStream/Test1',
  });
  t.after(() => gateway.close());
  return gateway;
}

test('[tickets: POC-EVENT-WORKER-001] stores tasks and exposes platform POC entity structures', async (t) => {
  const gateway = createGateway(t);

  const created = await gateway.createTask({ data: { name: 'First task' } });
  const listed = await gateway.listTasks();
  const filtered = await gateway.listTasks({ tenantId: 'IEBBeta', tenantProcessId: 'TaskStream/Test1' });
  const filteredOut = await gateway.listTasks({ tenantId: 'OtherTenant' });
  const stored = await gateway.getTask(created.id);
  const structures = await gateway.listEntityStructureVersions();
  const structure = await gateway.getCurrentTaskStructure();

  assert.ok(created.id);
  assert.equal(listed.length, 1);
  assert.equal(filtered.length, 1);
  assert.equal(filteredOut.length, 0);
  assert.equal(listed[0]?.id, created.id);
  assert.deepEqual(listed[0]?.data, { name: 'First task' });
  assert.deepEqual(stored?.data, { name: 'First task' });
  assert.equal(stored?.tenantId, 'IEBBeta');
  assert.equal(stored?.tenantProcessId, 'TaskStream/Test1');
  assert.equal(stored?.schemaVersion, 1);
  assert.equal(structure.entityType, 'Task');
  assert.equal(structure.version, 1);
  assert.deepEqual(
    structures.map((entry) => entry.entityType).sort(),
    ['EntityStructureVersion', 'Event', 'EventReaction', 'PersistentQueueItem', 'ProcessWorkEntry', 'Task'],
  );
});

test('[tickets: POC-EVENT-WORKER-001] routes supported Task Events to planner queue items', async (t) => {
  const gateway = createGateway(t);

  const created = await gateway.createTask({ data: { name: 'Routed task' } });
  const updateSignal = await gateway.signalTaskUpdate(created.id);
  const missingUpdateSignal = await gateway.signalTaskUpdate('missing-task');
  const updateSignals = await gateway.listTaskUpdateSignals();
  const events = await gateway.listEvents();
  const queuedItems = await gateway.listPersistentQueueItems();

  assert.equal(updateSignal?.taskId, created.id);
  assert.equal(updateSignal?.status, 'queued');
  assert.equal(missingUpdateSignal, null);
  assert.equal(updateSignals.length, 1);
  assert.deepEqual(events.map((event) => event.eventType), ['task.created', 'task.updated']);
  assert.equal(queuedItems.length, 2);
  assert.deepEqual(
    queuedItems.map((item) => item.sourceEventId),
    events.map((event) => event.id),
  );
  assert.ok(queuedItems.every((item) => item.intentType === 'planner.process-channel'));
  assert.ok(queuedItems.every((item) => item.handlerKey === 'task-planning.process-channel'));
  assert.ok(queuedItems.every((item) => item.tenantProcessId === 'TaskStream/Test1'));
  assert.ok(events.every((event) => event.payload.tenantProcessId === 'TaskStream/Test1'));
});

test('[tickets: POC-EVENT-WORKER-001] leaves unsupported Events without queue work', async (t) => {
  const gateway = createGateway(t);

  const event = await gateway.recordEvent({
    eventType: 'task.unsupported',
    sourceEntityType: 'Task',
    sourceEntityId: 'virtual-task',
    payload: { reason: 'coverage' },
  });
  const events = await gateway.listEvents();
  const queuedItems = await gateway.listPersistentQueueItems();

  assert.equal(event.eventType, 'task.unsupported');
  assert.equal(events.length, 1);
  assert.equal(events[0]?.id, event.id);
  assert.equal(queuedItems.length, 0);
});

test('[tickets: POC-EVENT-WORKER-001] claims each persistent queue item once', async (t) => {
  const gateway = createGateway(t);
  await gateway.createTask({ data: { name: 'Claimed once' } });

  const claimed = await gateway.claimNextPersistentQueueItem('worker-1');
  const secondClaim = await gateway.claimNextPersistentQueueItem('worker-2');
  const completed = claimed ? await gateway.completePersistentQueueItem(claimed.id) : null;
  const afterCompletionClaim = await gateway.claimNextPersistentQueueItem('worker-2');

  assert.equal(claimed?.status, 'claimed');
  assert.equal(claimed?.claimedBy, 'worker-1');
  assert.equal(claimed?.attemptCount, 1);
  assert.equal(secondClaim, null);
  assert.equal(completed?.status, 'completed');
  assert.ok(completed?.completedAt);
  assert.equal(afterCompletionClaim, null);
});

test('[tickets: POC-EVENT-WORKER-001] records queue processing failure', async (t) => {
  const gateway = createGateway(t);
  await gateway.createTask({ data: { name: 'Failed queue item' } });

  const claimed = await gateway.claimNextPersistentQueueItem('worker-1');
  assert.ok(claimed);
  const failed = await gateway.failPersistentQueueItem(claimed.id, 'ProcessChannel failed');
  const reclaim = await gateway.claimNextPersistentQueueItem('worker-2');

  assert.equal(failed.status, 'failed');
  assert.equal(failed.lastError, 'ProcessChannel failed');
  assert.ok(failed.failedAt);
  assert.equal(reclaim, null);
});

test('[tickets: POC-EVENT-WORKER-001] materializes one real work entry for a queue item', async (t) => {
  const gateway = createGateway(t);
  await gateway.createTask({ data: { name: 'Work idempotency' } });
  const claimed = await gateway.claimNextPersistentQueueItem('worker-1');
  assert.ok(claimed);

  const first = await gateway.createProcessWorkEntry({
    sourceEventId: claimed.sourceEventId,
    sourceQueueItemId: claimed.id,
    tenantProcessId: 'TaskStream/Test1',
    channelId: 'processWork',
    flowId: 'prepareWork',
    executionId: 'execution-1',
    workType: 'process-channel-result',
    status: 'materialized',
    payload: { processAction: 'first' },
  });
  const second = await gateway.createProcessWorkEntry({
    sourceEventId: claimed.sourceEventId,
    sourceQueueItemId: claimed.id,
    tenantProcessId: 'TaskStream/Test1',
    channelId: 'processWork',
    flowId: 'prepareWork',
    executionId: 'execution-2',
    workType: 'process-channel-result',
    status: 'materialized',
    payload: { processAction: 'second' },
  });
  const workEntries = await gateway.listProcessWorkEntries();

  assert.equal(first.id, second.id);
  assert.equal(workEntries.length, 1);
  assert.equal(workEntries[0]?.sourceEventId, claimed.sourceEventId);
  assert.equal(workEntries[0]?.sourceQueueItemId, claimed.id);
  assert.equal(workEntries[0]?.tenantProcessId, 'TaskStream/Test1');
  assert.equal(workEntries[0]?.channelId, 'processWork');
  assert.equal(workEntries[0]?.flowId, 'prepareWork');
  assert.equal(workEntries[0]?.executionId, 'execution-1');
  assert.equal(workEntries[0]?.workType, 'process-channel-result');
});


test('[tickets: POC-EVENT-WORKER-001] reset clears all lifecycle rows and restores structures', async (t) => {
  const gateway = createGateway(t);
  const created = await gateway.createTask({ data: { name: 'Reset me' } });
  await gateway.signalTaskUpdate(created.id);
  const claimed = await gateway.claimNextPersistentQueueItem('reset-test-worker');
  assert.ok(claimed);
  await gateway.createProcessWorkEntry({
    sourceEventId: claimed.sourceEventId,
    sourceQueueItemId: claimed.id,
    tenantProcessId: 'TaskStream/Test1',
    channelId: 'processWork',
    flowId: 'prepareWork',
    executionId: 'reset-execution',
    workType: 'process-channel-result',
    status: 'materialized',
    payload: {},
  });

  await gateway.resetDatabase();

  assert.deepEqual(await gateway.listTasks(), []);
  assert.deepEqual(await gateway.listTaskUpdateSignals(), []);
  assert.deepEqual(await gateway.listEvents(), []);
  assert.deepEqual(await gateway.listPersistentQueueItems(), []);
  assert.deepEqual(await gateway.listProcessWorkEntries(), []);
  assert.equal((await gateway.listEntityStructureVersions()).length, 6);
});

test('[tickets: POC-TENANTPROCESS-REGISTRATION-GATE-001] rejects task creation when configured TenantProcess was not registered', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'taskstream-task-gateway-unregistered-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const gateway = new SqliteTaskStorageGateway(join(directory, 'tasks.sqlite'), {
    defaultTenantProcessId: 'tenant-process.unregistered',
    isTenantProcessRegistered: () => false,
  });
  t.after(() => gateway.close());

  await assert.rejects(
    () => gateway.createTask({ data: { name: 'Must not exist' } }),
    /Cannot create Task for unregistered TenantProcess/u,
  );
  assert.deepEqual(await gateway.listTasks(), []);
  assert.deepEqual(await gateway.listPersistentQueueItems(), []);
});
