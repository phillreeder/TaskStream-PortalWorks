import type { TaskStorageGateway } from '../../tenants/IEBBeta/TenantProcesses/Test1/task-storage/TaskStorageGateway.js';
import type {
  EntityStructureVersion,
  StoredTask,
  PersistentQueueItem,
  ProcessWorkEntry,
  StoredEvent,
  TaskUpdateSignal,
} from '../../tenants/IEBBeta/TenantProcesses/Test1/task-storage/types.js';

export type InspectionCollectionId =
  | 'tasks'
  | 'task-update-signals'
  | 'events'
  | 'persistent-queue-items'
  | 'process-work-entries'
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
  sourceType: 'tenant-process' | 'task-update-signal' | 'event' | 'persistent-queue' | 'process-work' | 'system-registration';
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
    description: 'Durable work materialized from ProcessChannel processing.',
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

  if (collectionId === 'entity-structure-versions') {
    return (await gateway.listEntityStructureVersions()).map(toStructureInspectionRecord);
  }

  return null;
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
