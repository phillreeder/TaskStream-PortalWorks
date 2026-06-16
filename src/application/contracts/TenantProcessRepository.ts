import type { TenantProcessRuntime } from '../../domain/entities/execution.js';

export interface TenantProcessRepository {
  getById(id: string, version: string): Promise<TenantProcessRuntime | undefined>;
}
