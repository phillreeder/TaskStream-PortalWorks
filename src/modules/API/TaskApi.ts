import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { routeTaskStorageRequest, type TaskStorageRouteOptions } from '../task-storage/routes.js';
import type { TaskStorageGateway } from '../../poc/task-storage/Test1/TaskStorageGateway.js';

export type TaskApiOptions = TaskStorageRouteOptions;

export function createTaskApi(gateway: TaskStorageGateway, options: TaskApiOptions): Server {
  return createServer(async (request, response) => {
    try {
      await routeRequest(request, response, gateway, options);
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
  options: TaskApiOptions,
): Promise<void> {
  const method = request.method ?? 'GET';
  const url = new URL(request.url ?? '/', 'http://localhost');

  if (method === 'GET' && url.pathname === '/api/health') {
    sendJson(response, 200, { status: 'ok', service: 'taskstream-api' });
    return;
  }

  if (await routeTaskStorageRequest(request, response, gateway, options, url)) {
    return;
  }

  sendJson(response, 404, { error: 'Route not found.' });
}

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}
