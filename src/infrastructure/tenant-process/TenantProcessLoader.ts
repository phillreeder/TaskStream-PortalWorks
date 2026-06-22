import {
  validateTenantProcessDefinition,
  type TenantProcessDefinition,
} from '../../domain/tenantProcess/index.js';
import { TenantProcessLoadParameterStore } from './TenantProcessLoadParameterStore.js';

export type TenantProcessCompositeId = {
  readonly tenant: string;
  readonly process: string;
};

export function tenantProcessCompositeKey(id: TenantProcessCompositeId): string {
  return `${id.tenant}/${id.process}`;
}

export type DiscoverableTenantProcess = TenantProcessDefinition & {
  readonly id: TenantProcessCompositeId;
};

export type TenantProcessLoaderInput = {
  readonly tenantProcessId: string;
};

export type TenantProcessResolution = {
  readonly tenantProcess: DiscoverableTenantProcess;
  readonly requestedTenantProcessId: string;
  readonly resolvedTenantProcessId: string;
  readonly loaderKey: string;
};

export type TenantProcessModule = Record<string, unknown> & {
  readonly tenantProcess?: unknown;
};

export class TenantProcessLoadError extends Error {
  public constructor(
    public readonly code:
      | 'POC_TENANT_PROCESS_PARAMETERS_NOT_REGISTERED'
      | 'POC_TENANT_PROCESS_DISCOVERY_FAILED'
      | 'POC_TENANT_PROCESS_DUPLICATE_ID'
      | 'POC_TENANT_PROCESS_ENTRY_EXPORT_MISSING'
      | 'POC_TENANT_PROCESS_ENTRY_EXPORT_INVALID'
      | 'POC_TENANT_PROCESS_MODULE_IMPORT_FAILED'
      | 'POC_TENANT_PROCESS_EXPORT_MISSING'
      | 'POC_TENANT_PROCESS_VALIDATION_FAILED'
      | 'POC_TENANT_PROCESS_IDENTITY_MISMATCH',
    message: string,
    public readonly context: Record<string, string> = {},
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'TenantProcessLoadError';
  }
}

export class TenantProcessLoader {
  public constructor(private readonly parameterStore: TenantProcessLoadParameterStore) {}

  public async load(input: TenantProcessLoaderInput): Promise<TenantProcessResolution> {
    const parameters = this.parameterStore.get(input.tenantProcessId);
    if (!parameters) {
      throw new TenantProcessLoadError(
        'POC_TENANT_PROCESS_PARAMETERS_NOT_REGISTERED',
        `No discovered TenantProcess loading parameters are registered for ${input.tenantProcessId}.`,
        { requestedTenantProcessId: input.tenantProcessId },
      );
    }

    let moduleNamespace: TenantProcessModule;
    try {
      moduleNamespace = (await import(parameters.entryModuleUrl)) as TenantProcessModule;
    } catch (error) {
      throw new TenantProcessLoadError(
        'POC_TENANT_PROCESS_MODULE_IMPORT_FAILED',
        `TenantProcess module import failed for ${input.tenantProcessId}.`,
        {
          requestedTenantProcessId: input.tenantProcessId,
          loaderKey: parameters.loaderKey,
          entryModuleUrl: parameters.entryModuleUrl,
        },
        { cause: error },
      );
    }

    const tenantProcess = selectTenantProcessExport(moduleNamespace, input.tenantProcessId, parameters.loaderKey);
    try {
      validateTenantProcessDefinition(tenantProcess);
    } catch (error) {
      throw new TenantProcessLoadError(
        'POC_TENANT_PROCESS_VALIDATION_FAILED',
        `TenantProcess export failed validation for ${input.tenantProcessId}.`,
        { requestedTenantProcessId: input.tenantProcessId, loaderKey: parameters.loaderKey },
        { cause: error },
      );
    }

    const resolvedTenantProcessId = tenantProcessCompositeKey(tenantProcess.id);
    if (resolvedTenantProcessId !== input.tenantProcessId) {
      throw new TenantProcessLoadError(
        'POC_TENANT_PROCESS_IDENTITY_MISMATCH',
        `TenantProcess identity mismatch: requested ${input.tenantProcessId}, resolved ${resolvedTenantProcessId}.`,
        {
          requestedTenantProcessId: input.tenantProcessId,
          resolvedTenantProcessId,
          loaderKey: parameters.loaderKey,
        },
      );
    }

    return {
      tenantProcess,
      requestedTenantProcessId: input.tenantProcessId,
      resolvedTenantProcessId,
      loaderKey: parameters.loaderKey,
    };
  }
}

export function selectTenantProcessExport(
  moduleNamespace: TenantProcessModule,
  requestedTenantProcessId: string,
  loaderKey: string,
): DiscoverableTenantProcess {
  const selected = moduleNamespace.tenantProcess;
  if (selected === undefined) {
    throw new TenantProcessLoadError(
      'POC_TENANT_PROCESS_EXPORT_MISSING',
      `TenantProcess module must explicitly export tenantProcess for ${requestedTenantProcessId}.`,
      { requestedTenantProcessId, loaderKey },
    );
  }
  return selected as DiscoverableTenantProcess;
}
