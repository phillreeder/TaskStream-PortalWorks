import { describe, expect, it } from 'vitest';
import { ExecutionDataLoader } from '../ExecutionDataLoader.js';
import { ExecutionDataLoaderError } from '../errors.js';
import {
  createRunRecord,
  createStreamState,
  createTenantProcess,
  InMemoryStreamStateRepository,
  InMemoryTenantProcessRepository,
} from './fixtures.js';

const buildLoader = () => {
  const streamState = createStreamState();
  const tenantProcess = createTenantProcess();
  return {
    run: createRunRecord(),
    loader: new ExecutionDataLoader({
      streamStates: new InMemoryStreamStateRepository({ [streamState.id]: streamState }),
      tenantProcesses: new InMemoryTenantProcessRepository({ [tenantProcess.id]: tenantProcess }),
    }),
  };
};

describe('ExecutionDataLoader', () => {
  it('builds an immutable execution snapshot', async () => {
    const { run, loader } = buildLoader();
    const snapshot = await loader.load(run);

    expect(snapshot.run.id).toBe(run.id);
    expect(snapshot.flow.key).toBe('flow.login');
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.tenantProcess)).toBe(true);
    expect(() => {
      // @ts-expect-error intentional mutation attempt
      snapshot.run.id = 'modified';
    }).toThrow();
  });

  it('throws a descriptive error when STO is missing', async () => {
    const streamState = createStreamState();
    const tenantProcess = createTenantProcess({ stos: new Map() });
    const loader = new ExecutionDataLoader({
      streamStates: new InMemoryStreamStateRepository({ [streamState.id]: streamState }),
      tenantProcesses: new InMemoryTenantProcessRepository({ [tenantProcess.id]: tenantProcess }),
    });

    await expect(loader.load(createRunRecord())).rejects.toBeInstanceOf(ExecutionDataLoaderError);
  });

  it('throws a descriptive error when stream state is missing', async () => {
    const tenantProcess = createTenantProcess();
    const loader = new ExecutionDataLoader({
      streamStates: new InMemoryStreamStateRepository({}),
      tenantProcesses: new InMemoryTenantProcessRepository({ [tenantProcess.id]: tenantProcess }),
    });

    await expect(loader.load(createRunRecord())).rejects.toMatchObject({
      code: 'STREAM_STATE_NOT_FOUND',
    });
  });

  it('throws a descriptive error when tenant process cannot be resolved', async () => {
    const streamState = createStreamState();
    const loader = new ExecutionDataLoader({
      streamStates: new InMemoryStreamStateRepository({ [streamState.id]: streamState }),
      tenantProcesses: new InMemoryTenantProcessRepository({}),
    });

    await expect(loader.load(createRunRecord())).rejects.toMatchObject({
      code: 'TENANT_PROCESS_NOT_FOUND',
    });
  });

  it('throws a descriptive error when tenant process key mismatches the run', async () => {
    const streamState = createStreamState();
    const tenantProcess = createTenantProcess({ key: 'tenant.alpha' });
    const loader = new ExecutionDataLoader({
      streamStates: new InMemoryStreamStateRepository({ [streamState.id]: streamState }),
      tenantProcesses: new InMemoryTenantProcessRepository({ [tenantProcess.id]: tenantProcess }),
    });

    const run = createRunRecord({ tenantProcessKey: 'tenant.beta' });
    await expect(loader.load(run)).rejects.toMatchObject({
      code: 'TENANT_PROCESS_MISMATCH',
    });
  });

  it('throws a descriptive error when flow referenced by STO is missing', async () => {
    const streamState = createStreamState();
    const tenantProcess = createTenantProcess({
      flows: new Map(),
    });
    const loader = new ExecutionDataLoader({
      streamStates: new InMemoryStreamStateRepository({ [streamState.id]: streamState }),
      tenantProcesses: new InMemoryTenantProcessRepository({ [tenantProcess.id]: tenantProcess }),
    });

    await expect(loader.load(createRunRecord())).rejects.toMatchObject({
      code: 'FLOW_NOT_FOUND',
    });
  });

  it('resolves STO and Flow references from the tenant process snapshot', async () => {
    const { run, loader } = buildLoader();
    const snapshot = await loader.load(run);

    expect(snapshot.sto.key).toBe(run.stoKey);
    expect(snapshot.flow.key).toBe(snapshot.sto.flowKey);
    expect(snapshot.tenantProcess.stos.get(run.stoKey)).toBeDefined();
  });
});
