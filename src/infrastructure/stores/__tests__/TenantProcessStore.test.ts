import { describe, expect, it } from 'vitest';
import { tenantProcessManifests, type TenantProcessManifest } from '../../storage/tenants/manifests.js';
import { TenantProcessStore } from '../TenantProcessStore.js';

describe('TenantProcessStore', () => {
  it('loads runtime definitions from manifest directories', async () => {
    const manifest = tenantProcessManifests[0];
    const store = new TenantProcessStore();
    const runtime = await store.getById(manifest.id, manifest.version);

    expect(runtime).toBeDefined();
    expect(runtime?.flows['flow.taskstream.initialize']).toBeDefined();
    expect(runtime?.stos['sto.taskstream.initialize']).toBeDefined();
    expect(runtime?.stateDefinition.name).toBe('taskstream.default-state');
    expect(runtime?.validators).toMatchObject({
      onboarding: {
        name: 'taskstream.session.validator',
      },
    });
  });

  it('memoizes hydrated tenant processes', async () => {
    const manifest = tenantProcessManifests[0];
    const store = new TenantProcessStore();
    const first = await store.getById(manifest.id, manifest.version);
    const second = await store.getById(manifest.id, manifest.version);
    expect(first).toBe(second);
  });

  it('returns undefined for missing processes', async () => {
    const store = new TenantProcessStore({ manifests: [] });
    const runtime = await store.getById('missing', '0.0.1');
    expect(runtime).toBeUndefined();
  });

  it('guards against duplicate id/version combinations', () => {
    const duplicateManifest: TenantProcessManifest = tenantProcessManifests[0];
    expect(() => new TenantProcessStore({ manifests: [duplicateManifest, duplicateManifest] })).toThrow(
      /Duplicate tenant process/,
    );
  });

  it('exposes validators, mappers, and selectors', async () => {
    const manifest = tenantProcessManifests[0];
    const store = new TenantProcessStore();
    const runtime = await store.getById(manifest.id, manifest.version);

    expect(runtime?.validators).toHaveProperty('onboarding');
    expect(runtime?.mappers).toHaveProperty('session');
    expect(runtime?.selectors).toHaveProperty('default');
  });

  it('populates cached runtime definitions via list()', async () => {
    const manifest = tenantProcessManifests[0];
    const store = new TenantProcessStore();

    expect(store.list()).toHaveLength(0);

    const runtime = await store.getById(manifest.id, manifest.version);
    expect(store.list()).toEqual([runtime]);
  });

  it('returns fresh instances when cache is disabled', async () => {
    const manifest = tenantProcessManifests[0];
    const store = new TenantProcessStore({ cache: false });

    const first = await store.getById(manifest.id, manifest.version);
    const second = await store.getById(manifest.id, manifest.version);
    expect(first).not.toBe(second);
  });

  it('can load multiple manifests supplied at construction', async () => {
    const manifest = tenantProcessManifests[0];
    const alternateManifest: TenantProcessManifest = {
      ...manifest,
      id: 'tenant.process.taskstream.default.v2',
      version: '1.0.1',
    };
    const store = new TenantProcessStore({ manifests: [manifest, alternateManifest] });

    const first = await store.getById(manifest.id, manifest.version);
    const second = await store.getById(alternateManifest.id, alternateManifest.version);
    expect(first?.key).toBe('tenant.taskstream.default');
    expect(second?.version).toBe('1.0.1');
  });
});
