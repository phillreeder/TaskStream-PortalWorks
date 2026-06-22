export type TenantProcessLoadParameters = {
  readonly loaderKey: string;
  readonly entryModuleUrl: string;
};

export class TenantProcessLoadParameterStore {
  private readonly parametersByTenantProcessId = new Map<string, TenantProcessLoadParameters>();

  public set(tenantProcessId: string, parameters: TenantProcessLoadParameters): void {
    this.parametersByTenantProcessId.set(tenantProcessId, parameters);
  }

  public get(tenantProcessId: string): TenantProcessLoadParameters | undefined {
    return this.parametersByTenantProcessId.get(tenantProcessId);
  }

  public entries(): ReadonlyArray<readonly [string, TenantProcessLoadParameters]> {
    return [...this.parametersByTenantProcessId.entries()];
  }
}
