import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { type TestContext } from 'node:test';
import { createTaskApi } from '../TaskApi.js';
import { POC_TENANT_PROCESS_IDS } from '../../../poc/tenant-process/PocTenantProcess.js';
import { PlannerWorker } from '../../../poc/planning/PlannerWorker.js';
import { SqliteTaskStorageGateway } from '../../../poc/tenant-process/Test1/task-storage/SqliteTaskStorageGateway.js';

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
  const completed = await new PlannerWorker('api-test-worker', gateway).runOnce();
  assert.ok(completed);

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
    data: { workType: string; sourceEventId: string; sourceQueueItemId: string; tenantProcessId: string; channelId: string; flowId: string; executionId: string };
  }>;
  const tracesResponse = await fetch(`${baseUrl}/api/inspection/collections/system-trace-records/records`);
  const traces = await tracesResponse.json() as Array<{ data: { operation: string; sourceQueueItemId: string } }>;
  const executionLogResponse = await fetch(`${baseUrl}/api/inspection/execution-log/${created.id}`);
  const executionLog = await executionLogResponse.json() as Array<{ kind: string; stage: string; identifiers: Record<string, string> }>;
  const structuresResponse = await fetch(`${baseUrl}/api/inspection/collections/entity-structure-versions/records`);
  const structures = await structuresResponse.json() as Array<{ title: string; provenance: { sourceType: string } }>;

  assert.equal(healthResponse.status, 200);
  assert.deepEqual(collections.map((collection) => collection.id), [
    'tasks',
    'task-update-signals',
    'events',
    'persistent-queue-items',
    'process-work-entries',
    'system-trace-records',
    'entity-structure-versions',
  ]);
  assert.equal(tasks[0]?.title, 'Inspectable task');
  assert.equal(tasks[0]?.provenance.tenantId, 'IEBBeta');
  assert.equal(events[0]?.data.eventType, 'task.created');
  assert.equal(events[0]?.data.sourceEntityId, created.id);
  assert.equal(events[0]?.id, completed.sourceEventId);
  assert.deepEqual(events[0]?.data.relationship.queueItemIds, [completed.id]);
  assert.deepEqual(events[0]?.data.relationship.queueStatuses, ['completed']);
  assert.deepEqual(events[0]?.data.relationship.workEntryIds, [workEntries[0]?.id]);
  assert.equal(queueItems[0]?.id, completed.id);
  assert.equal(queueItems[0]?.data.status, 'completed');
  assert.equal(queueItems[0]?.data.relationship.sourceEventId, events[0]?.id);
  assert.equal(queueItems[0]?.data.relationship.workEntryId, workEntries[0]?.id);
  assert.equal(workEntries[0]?.data.workType, 'process-channel-result');
  assert.equal(workEntries[0]?.data.sourceEventId, events[0]?.id);
  assert.equal(workEntries[0]?.data.sourceQueueItemId, completed.id);
  assert.equal(workEntries[0]?.data.tenantProcessId, POC_TENANT_PROCESS_IDS.tenantProcessId);
  assert.equal(workEntries[0]?.data.channelId, POC_TENANT_PROCESS_IDS.channelId);
  assert.equal(workEntries[0]?.data.flowId, POC_TENANT_PROCESS_IDS.flowId);
  assert.ok(workEntries[0]?.data.executionId);
  assert.ok(traces.some((trace) => trace.data.operation === 'poc.tenantprocess.work-entry.confirmed'));
  assert.equal(traces.at(-1)?.data.sourceQueueItemId, completed.id);
  assert.ok(executionLog.some((record) => record.kind === 'system-trace' && record.stage === 'poc.tenantprocess.work-entry.confirmed'));
  assert.ok(executionLog.some((record) => record.kind === 'domain-record' && record.identifiers.workEntryId === workEntries[0]?.id));
  assert.ok(structures.some((record) => record.title === 'Task v1'));
  assert.equal(structures[0]?.provenance.sourceType, 'system-registration');
});

test('POC reset route clears lifecycle data and restores registered structures', async (t) => {
  const { baseUrl } = await startApi(t);
  await fetch(`${baseUrl}/api/tasks`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Disposable task' }),
  });

  const resetResponse = await fetch(`${baseUrl}/api/poc/reset-database`, { method: 'POST' });
  const resetBody = await resetResponse.json() as { reset: boolean };
  const tasks = await (await fetch(`${baseUrl}/api/inspection/collections/tasks/records`)).json() as unknown[];
  const events = await (await fetch(`${baseUrl}/api/inspection/collections/events/records`)).json() as unknown[];
  const queueItems = await (await fetch(`${baseUrl}/api/inspection/collections/persistent-queue-items/records`)).json() as unknown[];
  const workEntries = await (await fetch(`${baseUrl}/api/inspection/collections/process-work-entries/records`)).json() as unknown[];
  const traces = await (await fetch(`${baseUrl}/api/inspection/collections/system-trace-records/records`)).json() as unknown[];
  const structures = await (await fetch(`${baseUrl}/api/inspection/collections/entity-structure-versions/records`)).json() as unknown[];

  assert.equal(resetResponse.status, 200);
  assert.equal(resetBody.reset, true);
  assert.deepEqual(tasks, []);
  assert.deepEqual(events, []);
  assert.deepEqual(queueItems, []);
  assert.deepEqual(workEntries, []);
  assert.deepEqual(traces, []);
  assert.equal(structures.length, 6);
});

test('API process no longer serves browser assets', async (t) => {
  const { baseUrl } = await startApi(t);
  const response = await fetch(`${baseUrl}/`);
  assert.equal(response.status, 404);
});
