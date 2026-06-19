import { getJson, postJson } from './httpClient';
import type {
  HealthResponse,
  ExecutionLogRecord,
  InspectionCollection,
  InspectionCollectionId,
  InspectionRecord,
  ProvenanceFilters,
  TaskUpdateSignal,
} from './contracts';

export const inspectionApi = {
  health(): Promise<HealthResponse> {
    return getJson('/api/health');
  },

  collections(): Promise<InspectionCollection[]> {
    return getJson('/api/inspection/collections');
  },

  createTask(name: string): Promise<{ id: string }> {
    return postJson('/api/tasks', { name });
  },

  signalTaskUpdate(taskId: string): Promise<TaskUpdateSignal> {
    return postJson(`/api/tasks/${encodeURIComponent(taskId)}/update-signals`);
  },

  resetDatabase(): Promise<{ reset: true }> {
    return postJson('/api/poc/reset-database');
  },

  records(collectionId: InspectionCollectionId, filters: ProvenanceFilters): Promise<InspectionRecord[]> {
    const search = new URLSearchParams();
    if (filters.tenantId.trim()) search.set('tenantId', filters.tenantId.trim());
    if (filters.tenantProcessId.trim()) search.set('tenantProcessId', filters.tenantProcessId.trim());

    const query = search.size > 0 ? `?${search.toString()}` : '';
    return getJson(`/api/inspection/collections/${encodeURIComponent(collectionId)}/records${query}`);
  },

  executionLog(recordId: string): Promise<ExecutionLogRecord[]> {
    return getJson(`/api/inspection/execution-log/${encodeURIComponent(recordId)}`);
  },
};
