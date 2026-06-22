import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateTenantProcessDefinition } from '../../domain/tenantProcess/index.js';
import {
  TenantProcessLoadError,
  tenantProcessCompositeKey,
  type DiscoverableTenantProcess,
  type TenantProcessModule,
} from './TenantProcessLoader.js';
import { TenantProcessLoadParameterStore } from './TenantProcessLoadParameterStore.js';

export type TenantProcessDiscovery = {
  readonly tenantProcessId: string;
  readonly tenantProcessIdentity: DiscoverableTenantProcess['id'];
  readonly loaderKey: string;
  readonly entryModuleUrl: string;
};

export class TenantProcessExplorer {
  public constructor(
    private readonly tenantsRoot: string,
    private readonly parameterStore: TenantProcessLoadParameterStore,
  ) {}

  public async discover(): Promise<ReadonlyArray<TenantProcessDiscovery>> {
    const discoveries: TenantProcessDiscovery[] = [];
    const tenantDirectories = await this.readDirectories(this.tenantsRoot);

    for (const tenantDirectory of tenantDirectories) {
      const processRoot = join(this.tenantsRoot, tenantDirectory, 'TenantProcess');
      const processDirectories = await this.readDirectories(processRoot, true);

      for (const processDirectory of processDirectories) {
        const entryModuleUrl = pathToFileURL(join(processRoot, processDirectory, 'index.js')).href;
        const loaderKey = `filesystem:${tenantDirectory}/TenantProcess/${processDirectory}`;
        let tenantProcess: DiscoverableTenantProcess;

        try {
          const moduleNamespace = await this.importModule(entryModuleUrl, loaderKey);
          tenantProcess = this.selectDiscoveredTenantProcess(moduleNamespace, loaderKey);
        } catch (error) {
          if (this.isRejectedCandidate(error)) continue;
          throw error;
        }

        const expectedIdentity = { tenant: tenantDirectory, process: processDirectory };
        const expectedId = tenantProcessCompositeKey(expectedIdentity);
        const tenantProcessId = tenantProcessCompositeKey(tenantProcess.id);
        if (tenantProcessId !== expectedId) {
          throw new TenantProcessLoadError(
            'POC_TENANT_PROCESS_IDENTITY_MISMATCH',
            `TenantProcess identity ${tenantProcessId} does not match filesystem identity ${expectedId}.`,
            { tenantProcessId, expectedTenantProcessId: expectedId, loaderKey },
          );
        }

        const existing = this.parameterStore.get(tenantProcessId);
        if (existing && existing.entryModuleUrl !== entryModuleUrl) {
          throw new TenantProcessLoadError(
            'POC_TENANT_PROCESS_DUPLICATE_ID',
            `TenantProcess discovery found duplicate ID ${tenantProcessId}.`,
            { tenantProcessId, firstLoaderKey: existing.loaderKey, duplicateLoaderKey: loaderKey },
          );
        }

        this.parameterStore.set(tenantProcessId, { loaderKey, entryModuleUrl });
        discoveries.push({ tenantProcessId, tenantProcessIdentity: tenantProcess.id, loaderKey, entryModuleUrl });
      }
    }

    return discoveries;
  }

  private isRejectedCandidate(error: unknown): boolean {
    return error instanceof TenantProcessLoadError && (
      error.code === 'POC_TENANT_PROCESS_ENTRY_EXPORT_MISSING' ||
      error.code === 'POC_TENANT_PROCESS_ENTRY_EXPORT_INVALID' ||
      error.code === 'POC_TENANT_PROCESS_MODULE_IMPORT_FAILED'
    );
  }

  private async readDirectories(root: string, missingIsEmpty = false): Promise<string[]> {
    try {
      const entries = await readdir(root, { withFileTypes: true });
      return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
    } catch (error) {
      if (missingIsEmpty && error instanceof Error && 'code' in error && error.code === 'ENOENT') return [];
      throw new TenantProcessLoadError(
        'POC_TENANT_PROCESS_DISCOVERY_FAILED',
        `TenantProcess discovery failed while reading ${root}.`,
        { discoveryRoot: root },
        { cause: error },
      );
    }
  }

  private async importModule(entryModuleUrl: string, loaderKey: string): Promise<TenantProcessModule> {
    try {
      return (await import(entryModuleUrl)) as TenantProcessModule;
    } catch (error) {
      throw new TenantProcessLoadError(
        'POC_TENANT_PROCESS_MODULE_IMPORT_FAILED',
        `TenantProcess discovery import failed for ${loaderKey}.`,
        { loaderKey, entryModuleUrl },
        { cause: error },
      );
    }
  }

  private selectDiscoveredTenantProcess(
    moduleNamespace: TenantProcessModule,
    loaderKey: string,
  ): DiscoverableTenantProcess {
    const candidate = moduleNamespace.tenantProcess;
    if (candidate === undefined) {
      throw new TenantProcessLoadError(
        'POC_TENANT_PROCESS_ENTRY_EXPORT_MISSING',
        `TenantProcess entry module must explicitly export tenantProcess for ${loaderKey}.`,
        { loaderKey, exportedKeys: Object.keys(moduleNamespace).sort().join(',') },
      );
    }

    try {
      validateTenantProcessDefinition(candidate);
      return candidate as DiscoverableTenantProcess;
    } catch (error) {
      throw new TenantProcessLoadError(
        'POC_TENANT_PROCESS_ENTRY_EXPORT_INVALID',
        `Explicit tenantProcess export failed validation for ${loaderKey}.`,
        { loaderKey, exportedKeys: Object.keys(moduleNamespace).sort().join(',') },
        { cause: error },
      );
    }
  }
}
