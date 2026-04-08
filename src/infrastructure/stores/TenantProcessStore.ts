import type { TenantProcessRepository } from '../../application/contracts/TenantProcessRepository.ts';
import type { TenantProcessRuntime } from '../../domain/entities/execution.ts';
import { normalizeTenantProcess } from '../../domain/logic/tenantProcess/normalizeTenantProcess.ts';
import { tenantProcessManifests, type TenantProcessManifest } from '../storage/tenants/manifests.js';

const compositeKey = (id: string, version: string) => `${id}@${version}`;

export interface TenantProcessStoreOptions {
  manifests?: readonly TenantProcessManifest[];
  cache?: boolean;
}

export class TenantProcessStore implements TenantProcessRepository {
  private readonly manifests: Map<string, TenantProcessManifest>;
  private readonly cacheEnabled: boolean;
  private readonly cache = new Map<string, TenantProcessRuntime>();

  constructor(options: TenantProcessStoreOptions = {}) {
    this.cacheEnabled = options.cache ?? true;
    this.manifests = new Map();
    for (const manifest of options.manifests ?? tenantProcessManifests) {
      const key = compositeKey(manifest.id, manifest.version);
      if (this.manifests.has(key)) {
        throw new Error(`Duplicate tenant process detected for ${key}`);
      }
      this.manifests.set(key, manifest);
    }
  }

  async getById(id: string, version: string): Promise<TenantProcessRuntime | undefined> {
    const key = compositeKey(id, version);
    if (this.cacheEnabled && this.cache.has(key)) {
      return this.cache.get(key);
    }

    const manifest = this.manifests.get(key);
    if (!manifest) {
      return undefined;
    }

    const runtime = await this.loadFromManifest(manifest);
    if (this.cacheEnabled) {
      this.cache.set(key, runtime);
    }
    return runtime;
  }

  list(): readonly TenantProcessRuntime[] {
    return Array.from(this.cache.values());
  }

  private async loadFromManifest(manifest: TenantProcessManifest): Promise<TenantProcessRuntime> {
    const [
      stateDefinition,
      flows,
      stos,
      validators,
      mappers,
      selectors,
    ] = await Promise.all([
      TenantProcessStore.importModule(new URL('./stateDefinition.js', manifest.baseUrl).href, 'stateDefinition'),
      TenantProcessStore.importModule(new URL('./flows.js', manifest.baseUrl).href, 'flows'),
      TenantProcessStore.importModule(new URL('./stos.js', manifest.baseUrl).href, 'stos'),
      TenantProcessStore.importModule(new URL('./validators.js', manifest.baseUrl).href, 'validators'),
      TenantProcessStore.importModule(new URL('./mappers.js', manifest.baseUrl).href, 'mappers'),
      TenantProcessStore.importModule(new URL('./selectors.js', manifest.baseUrl).href, 'selectors'),
    ]);

    return normalizeTenantProcess({
      id: manifest.id,
      key: manifest.key,
      version: manifest.version,
      flows,
      stos,
      stateDefinition,
      validators,
      mappers,
      selectors,
    });
  }

  private static async importModule<TExport>(href: string, exportName: string): Promise<TExport> {
    const module = await import(href);
    const resolved = (module as Record<string, unknown>)[exportName] ?? (module as Record<string, unknown>).default;
    if (!resolved) {
      throw new Error(`Module ${href} does not export ${exportName}`);
    }
    return resolved as TExport;
  }
}
