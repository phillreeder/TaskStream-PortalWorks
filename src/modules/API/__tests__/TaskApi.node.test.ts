import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { type TestContext } from 'node:test';
import { createTaskApi } from '../TaskApi.js';
import { SystemTraceRecorder } from '../../SystemTrace/index.js';
import { SqlSystemTraceAdapter, SqlSystemTraceQueryRepository } from '../../SystemTrace/sqlTracePersistence.js';
import { PlannerWorker } from '../../../poc/planning/PlannerWorker.js';
import { PocTenantProcessExplorer } from '../../../poc/planning/PocTenantProcessExplorer.js';
import { PocTenantProcessLoader } from '../../../poc/planning/PocTenantProcessLoader.js';
import { PocTenantProcessLoadParameterStore } from '../../../poc/planning/PocTenantProcessLoadParameterStore.js';
import { fileURLToPath } from 'node:url';
import { SqliteTaskStorageGateway } from '../../../poc/task-storage/Test1/SqliteTaskStorageGateway.js';

async function startApi(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), 'taskstream-task-api-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const databasePath = join(directory, 'tasks.sqlite');
  const gateway = new SqliteTaskStorageGateway(databasePath, {
    defaultTenantProcessId: 'TaskStream/Test1',
    isTenantProcessRegistered: (tenantProcessId) => tenantProcessId === 'TaskStream/Test1',
  });
  const traceAdapter = new SqlSystemTraceAdapter(databasePath);
  const traceRecorder = new SystemTraceRecorder({ adapter: traceAdapter });
  const traceRepository = new SqlSystemTraceQueryRepository(databasePath);
  t.after(() => gateway.close());
  t.after(() => traceAdapter.close());
  t.after(() => traceRepository.close());
  const server = createTaskApi(gateway, { traceRecorder, traceRepository });
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return { baseUrl: `http://127.0.0.1:${address.port}`, gateway, traceRecorder, traceRepository };
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
  const { baseUrl, gateway, traceRecorder } = await startApi(t);
  const createResponse = await fetch(`${baseUrl}/api/tasks`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Inspectable task' }),
  });
  const created = await createResponse.json() as { id: string };
  const parameters = new PocTenantProcessLoadParameterStore();
  const explorer = new PocTenantProcessExplorer(fileURLToPath(new URL('../../../../Tenants/', import.meta.url)), parameters);
  await explorer.discover();
  const loader = new PocTenantProcessLoader(parameters);
  const planned = await new PlannerWorker('api-test-worker', gateway, explorer, loader, traceRecorder).runOnce();
  assert.equal(planned?.status, 'completed');

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
  const workEntries = await workResponse.json() as unknown[];
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
  assert.equal(events[0]?.id, queueItems[0]?.data.relationship.sourceEventId);
  assert.deepEqual(events[0]?.data.relationship.queueItemIds, [queueItems[0]?.id]);
  assert.deepEqual(events[0]?.data.relationship.queueStatuses, ['completed']);
  assert.equal(events[0]?.data.relationship.workEntryIds.length, 1);
  assert.equal(queueItems[0]?.data.status, 'completed');
  assert.equal(queueItems[0]?.data.relationship.sourceEventId, events[0]?.id);
  assert.equal(queueItems[0]?.data.relationship.workEntryId, events[0]?.data.relationship.workEntryIds[0]);
  assert.equal(workEntries.length, 1);
  assert.ok(traces.some((trace) => trace.data.operation === 'poc.planner.tenantprocess.resolved'));
  assert.ok(traces.some((trace) => trace.data.operation === 'poc.tenantprocess.work-entry.confirmed'));
  assert.ok(traces.some((trace) => trace.data.operation === 'poc.planner.queue-item.completed'));
  assert.ok(!traces.some((trace) => trace.data.operation === 'poc.planner.tenantprocess.execution.failed'));
  assert.equal(traces.at(-1)?.data.sourceQueueItemId, queueItems[0]?.id);
  assert.ok(executionLog.some((record) => record.kind === 'system-trace' && record.stage === 'poc.planner.queue-item.completed'));
  assert.ok(executionLog.some((record) => record.kind === 'domain-record' && record.identifiers.workEntryId));
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
  assert.equal(workEntries.length, 1);
  assert.deepEqual(traces, []);
  assert.equal(structures.length, 6);
});

test('API process no longer serves browser assets', async (t) => {
  const { baseUrl } = await startApi(t);
  const response = await fetch(`${baseUrl}/`);
  assert.equal(response.status, 404);
});
