import { TASK_STRUCTURE } from '../../entity-structures/index.js';

export const TASK_ENTITY_TYPE = TASK_STRUCTURE.entityType;
export const TASK_SCHEMA_VERSION = TASK_STRUCTURE.version;

export const DEFAULT_TENANT_PROCESS_ID = 'TaskStream/Test1' as const;

export type TaskData = { name: string };
export type CreateTaskInput = { data: TaskData };

export type StoredTask = {
  id: string;
  entityType: typeof TASK_ENTITY_TYPE;
  tenantId: 'IEBBeta';
  tenantProcessId: string;
  schemaVersion: number;
  data: TaskData;
  createdAt: string;
  updatedAt: string;
};

export type RecordEventInput = {
  eventType: string;
  sourceEntityType: string;
  sourceEntityId: string;
  payload?: Record<string, unknown>;
  occurredAt?: string;
};

export type StoredEvent = {
  id: string;
  eventType: string;
  sourceEntityType: string;
  sourceEntityId: string;
  entityStructureType: string;
  entityStructureVersion: number;
  payload: Record<string, unknown>;
  occurredAt: string;
};

export type PersistentQueueStatus = 'queued' | 'claimed' | 'completed' | 'failed';

export type PersistentQueueItem = {
  id: string;
  sourceEventId: string;
  tenantProcessId: string;
  eventReactionId: string;
  intentType: string;
  handlerKey: string;
  status: PersistentQueueStatus;
  attemptCount: number;
  availableAt: string;
  claimedBy: string | null;
  claimedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  lastError: string | null;
  createdAt: string;
};

export type CreateProcessWorkEntryInput = {
  sourceEventId: string;
  sourceQueueItemId: string;
  tenantProcessId: string;
  channelId: string;
  flowId: string;
  executionId: string;
  workType: string;
  status: string;
  payload: Record<string, unknown>;
};

export type ProcessWorkEntry = {
  id: string;
  sourceEventId: string;
  sourceQueueItemId: string;
  tenantProcessId: string;
  channelId: string;
  flowId: string;
  executionId: string;
  workType: string;
  status: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type TaskUpdateSignal = {
  id: string;
  taskId: string;
  tenantId: 'IEBBeta';
  tenantProcessId: string;
  status: 'queued';
  createdAt: string;
};

export type EntityStructureVersion = {
  entityType: string;
  version: number;
  structure: Record<string, unknown>;
  createdAt: string;
};
