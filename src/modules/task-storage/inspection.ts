import type { TaskStorageGateway } from '../../poc/task-storage/Test1/TaskStorageGateway.js';
import type { SqlSystemTraceQueryRepository, SqlSystemTraceRecord } from '../SystemTrace/sqlTracePersistence.js';
import type {
  EntityStructureVersion,
  StoredTask,
  PersistentQueueItem,
  ProcessWorkEntry,
  StoredEvent,
  TaskUpdateSignal,
} from '../../poc/task-storage/Test1/types.js';

export type InspectionCollectionId =
  | 'tasks'
  | 'task-update-signals'
  | 'events'
  | 'persistent-queue-items'
  | 'process-work-entries'
  | 'system-trace-records'
  | 'entity-structure-versions';

export type InspectionCollection = {
  id: InspectionCollectionId;
  title: string;
  description: string;
};

export type InspectionProvenance = {
  tenantId?: string;
  tenantProcessId?: string;
  entityType?: string;
  sourceType: 'tenant-process' | 'task-update-signal' | 'event' | 'persistent-queue' | 'process-work' | 'system-registration' | 'system-trace';
};

export type InspectionRecord = {
  id: string;
  collectionId: InspectionCollectionId;
  title: string;
  createdAt: string;
  updatedAt?: string;
  provenance: InspectionProvenance;
  data: Record<string, unknown>;
};

export type ExecutionLogRecord = {
  id: string;
  kind: 'domain-record' | 'queue-record' | 'system-trace';
  timestamp: string;
  level: string;
  stage: string;
  message: string;
  identifiers: {
    correlationId?: string;
    sourceTaskId?: string;
    sourceEventId?: string;
    sourceQueueItemId?: string;
    tenantProcessId?: string;
    channelId?: string;
    flowId?: string;
    executionId?: string;
    workEntryId?: string;
  };
  data: Record<string, unknown>;
};

export type InspectionFilters = {
  tenantId?: string;
  tenantProcessId?: string;
};

const collections: InspectionCollection[] = [
  {
    id: 'tasks',
    title: 'Tasks',
    description: 'Stored task entities for the active tenant process.',
  },
  {
    id: 'task-update-signals',
    title: 'Task update signals',
    description: 'Signals that request downstream task update processing.',
  },
  {
    id: 'events',
    title: 'Events',
    description: 'Durable facts persisted before reaction routing.',
  },
  {
    id: 'persistent-queue-items',
    title: 'Persistent queue items',
    description: 'SQLite-backed pending worker intents claimed by the worker.',
  },
  {
    id: 'process-work-entries',
    title: 'Process work entries',
    description: 'Durable work materialized by TenantProcess execution.',
  },
  {
    id: 'system-trace-records',
    title: 'SystemTrace records',
    description: 'Ordered structured trace records correlated to the POC lifecycle.',
  },
  {
    id: 'entity-structure-versions',
    title: 'Entity structures',
    description: 'Registered platform POC entity structure versions.',
  },
];

export function listInspectionCollections(): InspectionCollection[] {
  return collections;
}

export async function listInspectionRecords(
  gateway: TaskStorageGateway,
  traceRepository: SqlSystemTraceQueryRepository,
  collectionId: string,
  filters: InspectionFilters,
): Promise<InspectionRecord[] | null> {
  if (collectionId === 'tasks') {
    return (await gateway.listTasks(filters)).map(toTaskInspectionRecord);
  }

  if (collectionId === 'task-update-signals') {
    return (await gateway.listTaskUpdateSignals(filters)).map(toTaskUpdateSignalInspectionRecord);
  }

  if (collectionId === 'events') {
    const queueItems = await gateway.listPersistentQueueItems();
    const workEntries = await gateway.listProcessWorkEntries();
    return (await gateway.listEvents()).map((event) => toEventInspectionRecord(event, queueItems, workEntries));
  }

  if (collectionId === 'persistent-queue-items') {
    const workEntries = await gateway.listProcessWorkEntries();
    return (await gateway.listPersistentQueueItems()).map((item) => toQueueInspectionRecord(item, workEntries));
  }

  if (collectionId === 'process-work-entries') {
    return (await gateway.listProcessWorkEntries()).map(toWorkEntryInspectionRecord);
  }

  if (collectionId === 'system-trace-records') {
    return traceRepository.list().map(toSystemTraceInspectionRecord);
  }

  if (collectionId === 'entity-structure-versions') {
    return (await gateway.listEntityStructureVersions()).map(toStructureInspectionRecord);
  }

  return null;
}

export async function listExecutionLogRecords(
  gateway: TaskStorageGateway,
  traceRepository: SqlSystemTraceQueryRepository,
  selectedId: string,
): Promise<ExecutionLogRecord[]> {
  const [tasks, events, queueItems, workEntries, traceRecords] = await Promise.all([
    gateway.listTasks(),
    gateway.listEvents(),
    gateway.listPersistentQueueItems(),
    gateway.listProcessWorkEntries(),
    Promise.resolve(traceRepository.list()),
  ]);
  const ids = resolveExecutionIds(selectedId, tasks, events, queueItems, workEntries, traceRecords);
  if (!ids) return [];

  const domainRecords: ExecutionLogRecord[] = [];
  for (const event of events.filter((entry) => entry.id === ids.sourceEventId || entry.sourceEntityId === ids.sourceTaskId)) {
    domainRecords.push({
      id: `event:${event.id}`,
      kind: 'domain-record',
      timestamp: event.occurredAt,
      level: 'info',
      stage: 'durable.event',
      message: `Durable event ${event.eventType}`,
      identifiers: {
        sourceTaskId: event.sourceEntityId,
        sourceEventId: event.id,
      },
      data: event as unknown as Record<string, unknown>,
    });
  }
  for (const item of queueItems.filter((entry) => {
    const eventForQueue = events.find((event) => event.id === entry.sourceEventId);
    return entry.id === ids.sourceQueueItemId
      || entry.sourceEventId === ids.sourceEventId
      || (ids.sourceTaskId !== undefined && eventForQueue?.sourceEntityId === ids.sourceTaskId);
  })) {
    domainRecords.push({
      id: `queue:${item.id}`,
      kind: 'queue-record',
      timestamp: item.createdAt,
      level: item.status === 'failed' ? 'error' : 'info',
      stage: `queue.${item.status}`,
      message: `Persistent queue item ${item.status}`,
      identifiers: {
        sourceEventId: item.sourceEventId,
        sourceQueueItemId: item.id,
      },
      data: item as unknown as Record<string, unknown>,
    });
  }
  for (const entry of workEntries.filter((work) => {
    const eventForWork = events.find((event) => event.id === work.sourceEventId);
    return work.id === ids.workEntryId
      || work.sourceQueueItemId === ids.sourceQueueItemId
      || work.sourceEventId === ids.sourceEventId
      || (ids.sourceTaskId !== undefined && eventForWork?.sourceEntityId === ids.sourceTaskId);
  })) {
    domainRecords.push({
      id: `work:${entry.id}`,
      kind: 'domain-record',
      timestamp: entry.createdAt,
      level: entry.status === 'failed' ? 'error' : 'info',
      stage: `work.${entry.status}`,
      message: `Durable work entry ${entry.status}`,
      identifiers: {
        sourceEventId: entry.sourceEventId,
        sourceQueueItemId: entry.sourceQueueItemId,
        tenantProcessId: entry.tenantProcessId,
        channelId: entry.channelId,
        flowId: entry.flowId,
        executionId: entry.executionId,
        workEntryId: entry.id,
      },
      data: entry as unknown as Record<string, unknown>,
    });
  }

  const traceLogRecords = traceRecords
    .filter((record) => traceMatches(record, ids))
    .map(toExecutionLogRecord);

  return [...domainRecords, ...traceLogRecords].sort(compareExecutionLogRecords);
}

function toTaskInspectionRecord(task: StoredTask): InspectionRecord {
  return {
    id: task.id,
    collectionId: 'tasks',
    title: task.data.name,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    provenance: {
      tenantId: task.tenantId,
      tenantProcessId: task.tenantProcessId,
      entityType: task.entityType,
      sourceType: 'tenant-process',
    },
    data: task as unknown as Record<string, unknown>,
  };
}

function toTaskUpdateSignalInspectionRecord(signal: TaskUpdateSignal): InspectionRecord {
  return {
    id: signal.id,
    collectionId: 'task-update-signals',
    title: `Update ${signal.taskId}`,
    createdAt: signal.createdAt,
    provenance: {
      tenantId: signal.tenantId,
      tenantProcessId: signal.tenantProcessId,
      entityType: TASK_ENTITY_TYPE,
      sourceType: 'task-update-signal',
    },
    data: signal as unknown as Record<string, unknown>,
  };
}

const TASK_ENTITY_TYPE = 'Task';

function toEventInspectionRecord(
  event: StoredEvent,
  queueItems: readonly PersistentQueueItem[],
  workEntries: readonly ProcessWorkEntry[],
): InspectionRecord {
  const eventQueueItems = queueItems.filter((item) => item.sourceEventId === event.id);
  const eventWorkEntries = workEntries.filter((entry) => entry.sourceEventId === event.id);
  return {
    id: event.id,
    collectionId: 'events',
    title: `${event.eventType} ${event.sourceEntityId}`,
    createdAt: event.occurredAt,
    provenance: { entityType: event.entityStructureType, sourceType: 'event' },
    data: {
      ...event,
      relationship: {
        queueItemIds: eventQueueItems.map((item) => item.id),
        queueStatuses: eventQueueItems.map((item) => item.status),
        workEntryIds: eventWorkEntries.map((entry) => entry.id),
      },
    },
  };
}

function toQueueInspectionRecord(
  item: PersistentQueueItem,
  workEntries: readonly ProcessWorkEntry[],
): InspectionRecord {
  const workEntry = workEntries.find((entry) => entry.sourceQueueItemId === item.id);
  return {
    id: item.id,
    collectionId: 'persistent-queue-items',
    title: `${item.status} ${item.intentType}`,
    createdAt: item.createdAt,
    provenance: { entityType: 'PersistentQueueItem', sourceType: 'persistent-queue' },
    data: {
      ...item,
      relationship: {
        sourceEventId: item.sourceEventId,
        workEntryId: workEntry?.id ?? null,
      },
    },
  };
}

function toWorkEntryInspectionRecord(entry: ProcessWorkEntry): InspectionRecord {
  return {
    id: entry.id,
    collectionId: 'process-work-entries',
    title: `${entry.status} ${entry.workType}`,
    createdAt: entry.createdAt,
    provenance: { entityType: 'ProcessWorkEntry', sourceType: 'process-work' },
    data: entry as unknown as Record<string, unknown>,
  };
}

function toSystemTraceInspectionRecord(record: SqlSystemTraceRecord): InspectionRecord {
  return {
    id: record.id,
    collectionId: 'system-trace-records',
    title: `${record.operation}`,
    createdAt: record.timestamp,
    provenance: {
      tenantProcessId: record.tenantProcessId ?? undefined,
      entityType: 'SystemTraceRecord',
      sourceType: 'system-trace',
    },
    data: record as unknown as Record<string, unknown>,
  };
}

function toStructureInspectionRecord(structure: EntityStructureVersion): InspectionRecord {
  return {
    id: `${structure.entityType}:${structure.version}`,
    collectionId: 'entity-structure-versions',
    title: `${structure.entityType} v${structure.version}`,
    createdAt: structure.createdAt,
    provenance: {
      entityType: structure.entityType,
      sourceType: 'system-registration',
    },
    data: structure as unknown as Record<string, unknown>,
  };
}

function toExecutionLogRecord(record: SqlSystemTraceRecord): ExecutionLogRecord {
  return {
    id: `trace:${record.id}`,
    kind: 'system-trace',
    timestamp: record.timestamp,
    level: record.severity ?? 'info',
    stage: record.operation,
    message: record.message ?? record.operation,
    identifiers: stripUndefined({
      correlationId: record.correlationId ?? undefined,
      sourceTaskId: record.sourceTaskId ?? undefined,
      sourceEventId: record.sourceEventId ?? undefined,
      sourceQueueItemId: record.sourceQueueItemId ?? undefined,
      tenantProcessId: record.tenantProcessId ?? undefined,
      channelId: record.channelId ?? undefined,
      flowId: record.flowId ?? undefined,
      executionId: record.executionId ?? undefined,
      workEntryId: record.workEntryId ?? undefined,
    }),
    data: record.raw as unknown as Record<string, unknown>,
  };
}

function resolveExecutionIds(
  selectedId: string,
  tasks: readonly StoredTask[],
  events: readonly StoredEvent[],
  queueItems: readonly PersistentQueueItem[],
  workEntries: readonly ProcessWorkEntry[],
  traceRecords: readonly SqlSystemTraceRecord[],
): {
  sourceTaskId?: string;
  sourceEventId?: string;
  sourceQueueItemId?: string;
  workEntryId?: string;
  executionId?: string;
  correlationId?: string;
} | null {
  const task = tasks.find((entry) => entry.id === selectedId);
  if (task) return { sourceTaskId: task.id, correlationId: task.id };
  const event = events.find((entry) => entry.id === selectedId);
  if (event) return { sourceTaskId: event.sourceEntityId, sourceEventId: event.id, correlationId: event.sourceEntityId };
  const queueItem = queueItems.find((entry) => entry.id === selectedId);
  if (queueItem) {
    const eventForQueue = events.find((entry) => entry.id === queueItem.sourceEventId);
    return {
      sourceTaskId: eventForQueue?.sourceEntityId,
      sourceEventId: queueItem.sourceEventId,
      sourceQueueItemId: queueItem.id,
      correlationId: eventForQueue?.sourceEntityId,
    };
  }
  const workEntry = workEntries.find((entry) => entry.id === selectedId);
  if (workEntry) {
    const eventForWork = events.find((entry) => entry.id === workEntry.sourceEventId);
    return {
      sourceTaskId: eventForWork?.sourceEntityId,
      sourceEventId: workEntry.sourceEventId,
      sourceQueueItemId: workEntry.sourceQueueItemId,
      workEntryId: workEntry.id,
      executionId: workEntry.executionId,
      correlationId: eventForWork?.sourceEntityId,
    };
  }
  const trace = traceRecords.find((entry) => entry.id === selectedId);
  if (trace) {
    return {
      sourceTaskId: trace.sourceTaskId ?? undefined,
      sourceEventId: trace.sourceEventId ?? undefined,
      sourceQueueItemId: trace.sourceQueueItemId ?? undefined,
      workEntryId: trace.workEntryId ?? undefined,
      executionId: trace.executionId ?? undefined,
      correlationId: trace.correlationId ?? undefined,
    };
  }
  return null;
}

function traceMatches(record: SqlSystemTraceRecord, ids: NonNullable<ReturnType<typeof resolveExecutionIds>>): boolean {
  return Boolean(
    (ids.correlationId && record.correlationId === ids.correlationId)
    || (ids.sourceTaskId && record.sourceTaskId === ids.sourceTaskId)
    || (ids.sourceEventId && record.sourceEventId === ids.sourceEventId)
    || (ids.sourceQueueItemId && record.sourceQueueItemId === ids.sourceQueueItemId)
    || (ids.workEntryId && record.workEntryId === ids.workEntryId)
    || (ids.executionId && record.executionId === ids.executionId),
  );
}

function compareExecutionLogRecords(left: ExecutionLogRecord, right: ExecutionLogRecord): number {
  const byTimestamp = left.timestamp.localeCompare(right.timestamp);
  if (byTimestamp !== 0) return byTimestamp;
  return left.id.localeCompare(right.id);
}

function stripUndefined<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as Partial<T>;
}
