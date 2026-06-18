import type { TaskStorageGateway } from '../../tenants/IEBBeta/TenantProcesses/Test1/task-storage/TaskStorageGateway.js';
import type {
  EntityStructureVersion,
  StoredTask,
  PlannerQueueItem,
  TaskEvent,
  TaskUpdateSignal,
} from '../../tenants/IEBBeta/TenantProcesses/Test1/task-storage/types.js';

export type InspectionCollectionId = 'tasks' | 'task-update-signals' | 'task-events' | 'planner-queue' | 'entity-structure-versions';

export type InspectionCollection = {
  id: InspectionCollectionId;
  title: string;
  description: string;
};

export type InspectionProvenance = {
  tenantId?: string;
  tenantProcessId?: string;
  entityType?: string;
  sourceType: 'tenant-process' | 'task-update-signal' | 'task-event' | 'planner-queue' | 'system-registration';
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
    title: 'Task update queue',
    description: 'Queued signals requesting downstream task update processing.',
  },
  {
    id: 'task-events',
    title: 'Task events',
    description: 'Durable task mutation events awaiting or driving planning.',
  },
  {
    id: 'planner-queue',
    title: 'Planner queue',
    description: 'SQLite-backed planning work claimed by the planner worker.',
  },
  {
    id: 'entity-structure-versions',
    title: 'Entity structures',
    description: 'Registered entity structure versions used by stored records.',
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

  if (collectionId === 'task-events') {
    return (await gateway.listTaskEvents()).map(toTaskEventInspectionRecord);
  }

  if (collectionId === 'planner-queue') {
    return (await gateway.listPlannerQueueItems()).map(toPlannerQueueInspectionRecord);
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


function toTaskEventInspectionRecord(event: TaskEvent): InspectionRecord {
  return {
    id: event.id,
    collectionId: 'task-events',
    title: `${event.eventType} ${event.taskId}`,
    createdAt: event.occurredAt,
    provenance: { entityType: event.entityStructureType, sourceType: 'task-event' },
    data: event as unknown as Record<string, unknown>,
  };
}

function toPlannerQueueInspectionRecord(item: PlannerQueueItem): InspectionRecord {
  return {
    id: item.id,
    collectionId: 'planner-queue',
    title: `${item.status} ${item.taskId}`,
    createdAt: item.createdAt,
    provenance: { entityType: 'PlannerQueueItem', sourceType: 'planner-queue' },
    data: item as unknown as Record<string, unknown>,
  };
}
