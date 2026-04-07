import { describe, expect, it } from 'vitest';
import type { TenantProcessDefinition } from '../../../domain/entities/execution.ts';
import { TenantProcessStore } from '../TenantProcessStore.js';

const demoProcess = (overrides: Partial<TenantProcessDefinition> = {}): TenantProcessDefinition => ({
  id: 'tenant.demo',
  key: 'tenant.demo',
  version: '1.0.0',
  flows: {},
  stos: {},
  stateDefinition: {
    name: 'demo',
    evaluate: async () => ({ valid: true }),
  },
  ...overrides,
});

describe('TenantProcessStore', () => {
  it('retrieves processes by id and version', async () => {
    const store = new TenantProcessStore({ definitions: [demoProcess()] });
    const definition = await store.getById('tenant.demo', '1.0.0');
    expect(definition?.key).toBe('tenant.demo');
  });

  it('returns undefined when version does not match', async () => {
    const store = new TenantProcessStore({ definitions: [demoProcess()] });
    const definition = await store.getById('tenant.demo', '2.0.0');
    expect(definition).toBeUndefined();
  });

  it('guards against duplicate id/version combinations', () => {
    expect(
      () =>
        new TenantProcessStore({
          definitions: [demoProcess(), demoProcess({ key: 'tenant.duplicate' })],
        }),
    ).toThrow(/Duplicate tenant process/);
  });
});
