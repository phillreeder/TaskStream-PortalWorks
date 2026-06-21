export type PocTenantProcessLoadParameters = {
  readonly loaderKey: string;
  readonly entryModuleUrl: string;
};

export class PocTenantProcessLoadParameterStore {
  private readonly parametersByTenantProcessId = new Map<string, PocTenantProcessLoadParameters>();

  public set(tenantProcessId: string, parameters: PocTenantProcessLoadParameters): void {
    this.parametersByTenantProcessId.set(tenantProcessId, parameters);
  }

  public get(tenantProcessId: string): PocTenantProcessLoadParameters | undefined {
    return this.parametersByTenantProcessId.get(tenantProcessId);
  }

  public entries(): ReadonlyArray<readonly [string, PocTenantProcessLoadParameters]> {
    return [...this.parametersByTenantProcessId.entries()];
  }
}
