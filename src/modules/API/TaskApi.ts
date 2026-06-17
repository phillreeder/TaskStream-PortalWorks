import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { TaskStorageGateway } from '../../tenants/IEBBeta/TenantProcesses/Test1/task-storage/TaskStorageGateway.js';

const dashboardAssets = {
  '/': { contentType: 'text/html; charset=utf-8', body: readDashboardAsset('../../poc/dashboard/index.html') },
  '/dashboard.js': { contentType: 'text/javascript; charset=utf-8', body: readDashboardAsset('../../poc/dashboard/dashboard.js') },
  '/taskApiClient.js': { contentType: 'text/javascript; charset=utf-8', body: readDashboardAsset('../../poc/dashboard/taskApiClient.js') },
} as const;

export function createTaskApi(gateway: TaskStorageGateway): Server {
  return createServer(async (request, response) => {
    try {
      await routeRequest(request, response, gateway);
    } catch (error) {
      sendJson(response, 500, {
        error: error instanceof Error ? error.message : 'Unexpected error.',
      });
    }
  });
}

async function routeRequest(
  request: IncomingMessage,
  response: ServerResponse,
  gateway: TaskStorageGateway,
): Promise<void> {
  const method = request.method ?? 'GET';
  const url = new URL(request.url ?? '/', 'http://localhost');

  const dashboardAsset = dashboardAssets[url.pathname as keyof typeof dashboardAssets];
  if (method === 'GET' && dashboardAsset) {
    sendAsset(response, dashboardAsset.contentType, dashboardAsset.body);
    return;
  }

  if (method === 'POST' && url.pathname === '/tasks') {
    const body = await readJsonBody(request);
    const name = typeof body.name === 'string' ? body.name : '';

    if (!name.trim()) {
      sendJson(response, 400, { error: 'Task name is required.' });
      return;
    }

    const result = await gateway.create({ data: { name } });
    sendJson(response, 201, result);
    return;
  }

  const taskMatch = /^\/tasks\/([^/]+)$/.exec(url.pathname);
  if (method === 'GET' && taskMatch) {
    const task = await gateway.findById(decodeURIComponent(taskMatch[1]));
    if (!task) {
      sendJson(response, 404, { error: 'Task not found.' });
      return;
    }

    sendJson(response, 200, task);
    return;
  }

  if (method === 'GET' && url.pathname === '/task-structure') {
    sendJson(response, 200, await gateway.getCurrentStructure());
    return;
  }

  sendJson(response, 404, { error: 'Route not found.' });
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return {};
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
  } catch {
    throw new Error('Request body must be valid JSON.');
  }
}

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

function readDashboardAsset(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

function sendAsset(response: ServerResponse, contentType: string, body: string): void {
  response.writeHead(200, { 'content-type': contentType });
  response.end(body);
}
