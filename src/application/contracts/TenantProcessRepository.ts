import type { TenantProcessRuntime } from '../../domain/entities/execution.ts';

export interface TenantProcessRepository {
  getById(id: string, version: string): Promise<TenantProcessRuntime | undefined>;
}
