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
  return `http://127.0.0.1:${address.port}`;
}

test('API creates, lists, and retrieves a stored task through /api routes', async (t) => {
  const baseUrl = await startApi(t);
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
});

test('inspection API exposes collections and normalized provenance records', async (t) => {
  const baseUrl = await startApi(t);
  await fetch(`${baseUrl}/api/tasks`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Inspectable task' }),
  });

  const healthResponse = await fetch(`${baseUrl}/api/health`);
  const collectionsResponse = await fetch(`${baseUrl}/api/inspection/collections`);
  const collections = await collectionsResponse.json() as Array<{ id: string }>;
  const tasksResponse = await fetch(`${baseUrl}/api/inspection/collections/tasks/records?tenantId=IEBBeta`);
  const tasks = await tasksResponse.json() as Array<{ title: string; provenance: { tenantId: string } }>;
  const structuresResponse = await fetch(`${baseUrl}/api/inspection/collections/entity-structure-versions/records`);
  const structures = await structuresResponse.json() as Array<{ title: string; provenance: { sourceType: string } }>;

  assert.equal(healthResponse.status, 200);
  assert.deepEqual(collections.map((collection) => collection.id), ['tasks', 'entity-structure-versions']);
  assert.equal(tasks[0]?.title, 'Inspectable task');
  assert.equal(tasks[0]?.provenance.tenantId, 'IEBBeta');
  assert.equal(structures[0]?.title, 'Task v1');
  assert.equal(structures[0]?.provenance.sourceType, 'system-registration');
});

test('API process no longer serves browser assets', async (t) => {
  const baseUrl = await startApi(t);
  const response = await fetch(`${baseUrl}/`);
  assert.equal(response.status, 404);
});
