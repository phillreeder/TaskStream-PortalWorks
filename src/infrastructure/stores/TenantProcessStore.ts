import type { TenantProcessRepository } from '../../application/execution/ExecutionDataLoader.js';
import type { TenantProcessDefinition } from '../../domain/entities/execution.ts';
import { tenantProcessRegistry } from '../../tenants/registry.js';

const compositeKey = (id: string, version: string) => `${id}@${version}`;

export interface TenantProcessStoreOptions {
  definitions?: readonly TenantProcessDefinition[];
}

export class TenantProcessStore implements TenantProcessRepository {
  private readonly definitions: readonly TenantProcessDefinition[];
  private readonly byId: Map<string, TenantProcessDefinition>;

  constructor(options: TenantProcessStoreOptions = {}) {
    this.definitions = options.definitions ?? tenantProcessRegistry;
    this.byId = new Map();
    for (const definition of this.definitions) {
      const key = compositeKey(definition.id, definition.version);
      if (this.byId.has(key)) {
        throw new Error(`Duplicate tenant process detected for ${key}`);
      }
      this.byId.set(key, definition);
    }
  }

  async getById(id: string, version: string): Promise<TenantProcessDefinition | undefined> {
    return this.byId.get(compositeKey(id, version));
  }

  list(): readonly TenantProcessDefinition[] {
    return this.definitions;
  }
}
