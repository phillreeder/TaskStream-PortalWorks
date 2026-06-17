import type { TaskStorageGateway } from '../../tenants/IEBBeta/TenantProcesses/Test1/task-storage/TaskStorageGateway.js';
import type {
  EntityStructureVersion,
  StoredTask,
} from '../../tenants/IEBBeta/TenantProcesses/Test1/task-storage/types.js';

export type InspectionCollectionId = 'tasks' | 'entity-structure-versions';

export type InspectionCollection = {
  id: InspectionCollectionId;
  title: string;
  description: string;
};

export type InspectionProvenance = {
  tenantId?: string;
  tenantProcessId?: string;
  entityType?: string;
  sourceType: 'tenant-process' | 'system-registration';
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
    const tasks = await gateway.listTasks(filters);
    return tasks.map(toTaskInspectionRecord);
  }

  if (collectionId === 'entity-structure-versions') {
    const structures = await gateway.listEntityStructureVersions();
    return structures.map(toStructureInspectionRecord);
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
