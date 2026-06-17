import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createTaskApi } from '../TaskApi.js';
import { SqliteTaskStorageGateway } from '../../../tenants/IEBBeta/TenantProcesses/Test1/task-storage/SqliteTaskStorageGateway.js';

test('API creates a task through the gateway and retrieves it by id', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'taskstream-task-api-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const gateway = new SqliteTaskStorageGateway(join(directory, 'tasks.sqlite'));
  t.after(() => gateway.close());
  const server = createTaskApi(gateway);
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const createResponse = await fetch(`${baseUrl}/tasks`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Dashboard-created task' }),
  });
  const created = await createResponse.json() as { id: string };
  const listResponse = await fetch(`${baseUrl}/tasks`);
  const tasks = await listResponse.json() as Array<{ id: string; data: { name: string } }>;
  const getResponse = await fetch(`${baseUrl}/tasks/${created.id}`);
  const stored = await getResponse.json() as {
    id: string;
    data: { name: string };
    schemaVersion: number;
  };

  assert.equal(createResponse.status, 201);
  assert.equal(listResponse.status, 200);
  assert.deepEqual(tasks.map((task) => task.id), [created.id]);
  assert.deepEqual(tasks[0]?.data, { name: 'Dashboard-created task' });
  assert.equal(getResponse.status, 200);
  assert.equal(stored.id, created.id);
  assert.equal(stored.schemaVersion, 1);
  assert.deepEqual(stored.data, { name: 'Dashboard-created task' });
});

test('API serves the minimal dashboard and browser API client from the same process', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'taskstream-dashboard-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const gateway = new SqliteTaskStorageGateway(join(directory, 'tasks.sqlite'));
  t.after(() => gateway.close());
  const server = createTaskApi(gateway);
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const pageResponse = await fetch(`${baseUrl}/`);
  const page = await pageResponse.text();
  const clientResponse = await fetch(`${baseUrl}/taskApiClient.js`);
  const client = await clientResponse.text();

  assert.equal(pageResponse.status, 200);
  assert.match(pageResponse.headers.get('content-type') ?? '', /text\/html/);
  assert.match(page, /IEBBeta \/ Test1/);
  assert.match(page, /dashboard\.js/);
  assert.equal(clientResponse.status, 200);
  assert.match(client, /class TaskApiClient/);
  assert.match(client, /createTask/);
  assert.match(client, /getTasks/);
  assert.match(client, /getTask/);
});
