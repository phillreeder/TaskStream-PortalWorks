export interface TenantProcessManifest {
  readonly id: string;
  readonly tenantId: string;
  readonly key: string;
  readonly version: string;
  readonly baseUrl: string;
}

export const tenantProcessManifests: readonly TenantProcessManifest[] = [
  {
    id: 'tenant.process.taskstream.default',
    tenantId: 'taskstream',
    key: 'tenant.taskstream.default',
    version: '1.0.0',
    baseUrl: new URL('./taskstream/processes/default/', import.meta.url).href,
  },
];
