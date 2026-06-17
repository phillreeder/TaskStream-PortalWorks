import { getJson } from './httpClient';
import type {
  HealthResponse,
  InspectionCollection,
  InspectionCollectionId,
  InspectionRecord,
  ProvenanceFilters,
} from './contracts';

export const inspectionApi = {
  health(): Promise<HealthResponse> {
    return getJson('/api/health');
  },

  collections(): Promise<InspectionCollection[]> {
    return getJson('/api/inspection/collections');
  },

  records(collectionId: InspectionCollectionId, filters: ProvenanceFilters): Promise<InspectionRecord[]> {
    const search = new URLSearchParams();
    if (filters.tenantId.trim()) search.set('tenantId', filters.tenantId.trim());
    if (filters.tenantProcessId.trim()) search.set('tenantProcessId', filters.tenantProcessId.trim());

    const query = search.size > 0 ? `?${search.toString()}` : '';
    return getJson(`/api/inspection/collections/${encodeURIComponent(collectionId)}/records${query}`);
  },
};
