import type {
  CreateProcessWorkEntryInput,
  CreateTaskInput,
  EntityStructureVersion,
  PersistentQueueItem,
  ProcessWorkEntry,
  RecordEventInput,
  StoredTask,
  StoredEvent,
  TaskUpdateSignal,
} from './types.js';

export type TaskFilters = { tenantId?: string; tenantProcessId?: string };

export interface TaskStorageGateway {
  createTask(input: CreateTaskInput): Promise<{ id: string }>;
  listTasks(filters?: TaskFilters): Promise<StoredTask[]>;
  getTask(id: string): Promise<StoredTask | null>;
  signalTaskUpdate(taskId: string): Promise<TaskUpdateSignal | null>;
  listTaskUpdateSignals(filters?: TaskFilters): Promise<TaskUpdateSignal[]>;
  recordEvent(input: RecordEventInput): Promise<StoredEvent>;
  getEvent(id: string): Promise<StoredEvent | null>;
  listEvents(): Promise<StoredEvent[]>;
  listPersistentQueueItems(): Promise<PersistentQueueItem[]>;
  claimNextPersistentQueueItem(workerId: string): Promise<PersistentQueueItem | null>;
  completePersistentQueueItem(id: string): Promise<PersistentQueueItem>;
  failPersistentQueueItem(id: string, lastError: string): Promise<PersistentQueueItem>;
  createProcessWorkEntry(input: CreateProcessWorkEntryInput): Promise<ProcessWorkEntry>;
  listProcessWorkEntries(): Promise<ProcessWorkEntry[]>;
  listEntityStructureVersions(): Promise<EntityStructureVersion[]>;
  getCurrentTaskStructure(): Promise<EntityStructureVersion>;
  resetDatabase(): Promise<void>;
  close(): void;
}
