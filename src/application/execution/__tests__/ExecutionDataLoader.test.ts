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
    const tenantProcess = createTenantProcess({ stos: {} });
    const loader = new ExecutionDataLoader({
      streamStates: new InMemoryStreamStateRepository({ [streamState.id]: streamState }),
      tenantProcesses: new InMemoryTenantProcessRepository({ [tenantProcess.id]: tenantProcess }),
    });

    await expect(loader.load(createRunRecord())).rejects.toBeInstanceOf(ExecutionDataLoaderError);
  });
});
