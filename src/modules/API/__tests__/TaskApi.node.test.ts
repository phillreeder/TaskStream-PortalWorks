import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { type TestContext } from 'node:test';
import { createTaskApi } from '../TaskApi.js';
import { SqliteTaskStorageGateway } from '../../../tenants/IEBBeta/TenantProcesses/Test1/task-storage/SqliteTaskStorageGateway.js';

async function startApi(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), 'taskstream-task-api-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const gateway = new SqliteTaskStorageGateway(join(directory, 'tasks.sqlite'));
  t.after(() => gateway.close());
  const server = createTaskApi(gateway);
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return { baseUrl: `http://127.0.0.1:${address.port}`, gateway };
}

test('API creates, lists, and retrieves a stored task through /api routes', async (t) => {
  const { baseUrl } = await startApi(t);
  const createResponse = await fetch(`${baseUrl}/api/tasks`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Dashboard-created task' }),
  });
  const created = await createResponse.json() as { id: string };
  const listResponse = await fetch(`${baseUrl}/api/tasks?tenantId=IEBBeta&tenantProcessId=Test1`);
  const tasks = await listResponse.json() as Array<{ id: string; data: { name: string } }>;
  const getResponse = await fetch(`${baseUrl}/api/tasks/${created.id}`);
  const stored = await getResponse.json() as { id: string; data: { name: string }; schemaVersion: number };

  assert.equal(createResponse.status, 201);
  assert.deepEqual(tasks.map((task) => task.id), [created.id]);
  assert.equal(stored.id, created.id);
  assert.equal(stored.schemaVersion, 1);
  assert.deepEqual(stored.data, { name: 'Dashboard-created task' });

  const signalResponse = await fetch(`${baseUrl}/api/tasks/${created.id}/update-signals`, { method: 'POST' });
  const signal = await signalResponse.json() as { taskId: string; status: string };
  const signalsResponse = await fetch(`${baseUrl}/api/inspection/collections/task-update-signals/records`);
  const signals = await signalsResponse.json() as Array<{ data: { taskId: string; status: string } }>;

  assert.equal(signalResponse.status, 202);
  assert.equal(signal.taskId, created.id);
  assert.equal(signal.status, 'queued');
  assert.equal(signals[0]?.data.taskId, created.id);
  assert.equal(signals[0]?.data.status, 'queued');
});

test('[tickets: POC-EVENT-WORKER-001] inspection API exposes the POC lifecycle through inspection APIs', async (t) => {
  const { baseUrl, gateway } = await startApi(t);
  const createResponse = await fetch(`${baseUrl}/api/tasks`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Inspectable task' }),
  });
  const created = await createResponse.json() as { id: string };
  const claimed = await gateway.claimNextPersistentQueueItem('api-test-worker');
  assert.ok(claimed);
  await gateway.createProcessWorkEntry({
    sourceEventId: claimed.sourceEventId,
    sourceQueueItemId: claimed.id,
    workType: 'process-channel-result',
    status: 'materialized',
    payload: {
      processAction: 'process-channel-outcome-pending-flow-decision',
      unresolvedDownstreamAction: 'start-flow-or-process-flow-undecided',
    },
  });
  await gateway.completePersistentQueueItem(claimed.id);

  const healthResponse = await fetch(`${baseUrl}/api/health`);
  const collectionsResponse = await fetch(`${baseUrl}/api/inspection/collections`);
  const collections = await collectionsResponse.json() as Array<{ id: string }>;
  const tasksResponse = await fetch(`${baseUrl}/api/inspection/collections/tasks/records?tenantId=IEBBeta`);
  const tasks = await tasksResponse.json() as Array<{ title: string; provenance: { tenantId: string } }>;
  const eventsResponse = await fetch(`${baseUrl}/api/inspection/collections/events/records`);
  const events = await eventsResponse.json() as Array<{
    id: string;
    data: {
      eventType: string;
      sourceEntityId: string;
      relationship: { queueItemIds: string[]; queueStatuses: string[]; workEntryIds: string[] };
    };
  }>;
  const queueResponse = await fetch(`${baseUrl}/api/inspection/collections/persistent-queue-items/records`);
  const queueItems = await queueResponse.json() as Array<{
    id: string;
    data: { status: string; relationship: { sourceEventId: string; workEntryId: string | null } };
  }>;
  const workResponse = await fetch(`${baseUrl}/api/inspection/collections/process-work-entries/records`);
  const workEntries = await workResponse.json() as Array<{
    id: string;
    data: { workType: string; sourceEventId: string; sourceQueueItemId: string };
  }>;
  const structuresResponse = await fetch(`${baseUrl}/api/inspection/collections/entity-structure-versions/records`);
  const structures = await structuresResponse.json() as Array<{ title: string; provenance: { sourceType: string } }>;

  assert.equal(healthResponse.status, 200);
  assert.deepEqual(collections.map((collection) => collection.id), [
    'tasks',
    'task-update-signals',
    'events',
    'persistent-queue-items',
    'process-work-entries',
    'entity-structure-versions',
  ]);
  assert.equal(tasks[0]?.title, 'Inspectable task');
  assert.equal(tasks[0]?.provenance.tenantId, 'IEBBeta');
  assert.equal(events[0]?.data.eventType, 'task.created');
  assert.equal(events[0]?.data.sourceEntityId, created.id);
  assert.equal(events[0]?.id, claimed.sourceEventId);
  assert.deepEqual(events[0]?.data.relationship.queueItemIds, [claimed.id]);
  assert.deepEqual(events[0]?.data.relationship.queueStatuses, ['completed']);
  assert.deepEqual(events[0]?.data.relationship.workEntryIds, [workEntries[0]?.id]);
  assert.equal(queueItems[0]?.id, claimed.id);
  assert.equal(queueItems[0]?.data.status, 'completed');
  assert.equal(queueItems[0]?.data.relationship.sourceEventId, events[0]?.id);
  assert.equal(queueItems[0]?.data.relationship.workEntryId, workEntries[0]?.id);
  assert.equal(workEntries[0]?.data.workType, 'process-channel-result');
  assert.equal(workEntries[0]?.data.sourceEventId, events[0]?.id);
  assert.equal(workEntries[0]?.data.sourceQueueItemId, claimed.id);
  assert.ok(structures.some((record) => record.title === 'Task v1'));
  assert.equal(structures[0]?.provenance.sourceType, 'system-registration');
});

test('API process no longer serves browser assets', async (t) => {
  const { baseUrl } = await startApi(t);
  const response = await fetch(`${baseUrl}/`);
  assert.equal(response.status, 404);
});
