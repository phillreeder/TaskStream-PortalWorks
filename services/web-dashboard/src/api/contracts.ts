export type HealthResponse = {
  status: 'ok';
  service: string;
};

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

export type ProvenanceFilters = {
  tenantId: string;
  tenantProcessId: string;
};

export type TaskUpdateSignal = {
  id: string;
  taskId: string;
  tenantId: string;
  tenantProcessId: string;
  status: 'queued';
  createdAt: string;
};
