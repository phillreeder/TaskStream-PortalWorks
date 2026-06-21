import type { IncomingMessage, ServerResponse } from 'node:http';
import type { TaskStorageGateway } from '../../poc/task-storage/Test1/TaskStorageGateway.js';
import type { SystemTraceRecorder } from '../SystemTrace/index.js';
import type { SqlSystemTraceQueryRepository } from '../SystemTrace/sqlTracePersistence.js';
import {
  listInspectionCollections,
  listExecutionLogRecords,
  listInspectionRecords,
  type InspectionFilters,
} from './inspection.js';

export interface TaskStorageRouteOptions {
  readonly traceRecorder: SystemTraceRecorder;
  readonly traceRepository: SqlSystemTraceQueryRepository;
}

export async function routeTaskStorageRequest(
  request: IncomingMessage,
  response: ServerResponse,
  gateway: TaskStorageGateway,
  options: TaskStorageRouteOptions,
  url: URL,
): Promise<boolean> {
  const method = request.method ?? 'GET';

  if (method === 'POST' && url.pathname === '/api/poc/reset-database') {
    await gateway.resetDatabase();
    options.traceRepository.clear();
    sendJson(response, 200, { reset: true });
    return true;
  }

  if (method === 'GET' && url.pathname === '/api/inspection/collections') {
    sendJson(response, 200, listInspectionCollections());
    return true;
  }

  const executionLogMatch = /^\/api\/inspection\/execution-log\/([^/]+)$/.exec(url.pathname);
  if (method === 'GET' && executionLogMatch) {
    sendJson(response, 200, await listExecutionLogRecords(gateway, options.traceRepository, decodeURIComponent(executionLogMatch[1])));
    return true;
  }

  const collectionMatch = /^\/api\/inspection\/collections\/([^/]+)\/records$/.exec(url.pathname);
  if (method === 'GET' && collectionMatch) {
    const records = await listInspectionRecords(
      gateway,
      options.traceRepository,
      decodeURIComponent(collectionMatch[1]),
      readInspectionFilters(url),
    );

    if (!records) {
      sendJson(response, 404, { error: 'Inspection collection not found.' });
      return true;
    }

    sendJson(response, 200, records);
    return true;
  }

  if (method === 'GET' && url.pathname === '/api/tasks') {
    sendJson(response, 200, await gateway.listTasks(readInspectionFilters(url)));
    return true;
  }

  if (method === 'POST' && url.pathname === '/api/tasks') {
    const body = await readJsonBody(request);
    const name = typeof body.name === 'string' ? body.name : '';

    if (!name.trim()) {
      sendJson(response, 400, { error: 'Task name is required.' });
      return true;
    }

    const created = await gateway.createTask({ data: { name } });
    await traceLatestTaskLifecycle(gateway, options.traceRecorder, created.id);
    sendJson(response, 201, created);
    return true;
  }

  const updateSignalMatch = /^\/api\/tasks\/([^/]+)\/update-signals$/.exec(url.pathname);
  if (method === 'POST' && updateSignalMatch) {
    const signal = await gateway.signalTaskUpdate(decodeURIComponent(updateSignalMatch[1]));
    if (!signal) {
      sendJson(response, 404, { error: 'Task not found.' });
      return true;
    }

    await traceLatestTaskLifecycle(gateway, options.traceRecorder, signal.taskId);
    sendJson(response, 202, signal);
    return true;
  }

  const taskMatch = /^\/api\/tasks\/([^/]+)$/.exec(url.pathname);
  if (method === 'GET' && taskMatch) {
    const task = await gateway.getTask(decodeURIComponent(taskMatch[1]));
    if (!task) {
      sendJson(response, 404, { error: 'Task not found.' });
      return true;
    }

    sendJson(response, 200, task);
    return true;
  }

  if (method === 'GET' && url.pathname === '/api/task-structure') {
    sendJson(response, 200, await gateway.getCurrentTaskStructure());
    return true;
  }

  return false;
}

async function traceLatestTaskLifecycle(
  gateway: TaskStorageGateway,
  traceRecorder: SystemTraceRecorder,
  taskId: string,
): Promise<void> {
  const events = (await gateway.listEvents()).filter((event) => event.sourceEntityId === taskId);
  const event = events.at(-1);
  if (!event) return;

  const queueItem = (await gateway.listPersistentQueueItems()).find((item) => item.sourceEventId === event.id);
  const baseContext = {
    correlationId: taskId,
    sourceTaskId: taskId,
    sourceEventId: event.id,
    ...(queueItem ? { sourceQueueItemId: queueItem.id } : {}),
  };

  await traceRecorder.trace({
    operation: 'poc.task.event.persisted',
    phase: 'POINT',
    severity: 'info',
    status: 'ok',
    correlationId: taskId,
    message: 'Task event persisted',
    component: 'TaskStorageRoutes',
    context: {
      ...baseContext,
      eventType: event.eventType,
    },
  });

  if (!queueItem) return;

  await traceRecorder.trace({
    operation: 'poc.event-reaction.selected',
    phase: 'POINT',
    severity: 'info',
    status: 'ok',
    correlationId: taskId,
    message: 'Event reaction selected',
    component: 'TaskStorageRoutes',
    context: {
      ...baseContext,
      eventReactionId: queueItem.eventReactionId,
      handlerKey: queueItem.handlerKey,
    },
  });
  await traceRecorder.trace({
    operation: 'poc.queue-item.created',
    phase: 'POINT',
    severity: 'info',
    status: 'ok',
    correlationId: taskId,
    message: 'Queue item created',
    component: 'TaskStorageRoutes',
    context: {
      ...baseContext,
      intentType: queueItem.intentType,
    },
  });
}

function readInspectionFilters(url: URL): InspectionFilters {
  const tenantId = url.searchParams.get('tenantId')?.trim();
  const tenantProcessId = url.searchParams.get('tenantProcessId')?.trim();

  return {
    ...(tenantId ? { tenantId } : {}),
    ...(tenantProcessId ? { tenantProcessId } : {}),
  };
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
