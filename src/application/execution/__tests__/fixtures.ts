import type { ExecutionSnapshot, FlowDefinition, RunRecord, StateDefinition, StateTransitionOperation, StreamState, TenantProcessDefinition } from '../../../domain/entities/execution.ts';
import { ExecutionDataLoader, type ExecutionDataLoaderDependencies } from '../ExecutionDataLoader.js';
import type { StreamStateRepository, TenantProcessRepository } from '../ExecutionDataLoader.js';

const baseRun: RunRecord = {
  id: 'run-001',
  streamStateId: 'stream-001',
  tenantProcessId: 'tenant-1',
  tenantProcessKey: 'tenant.alpha',
  tenantProcessVersion: '1.0.0',
  stoKey: 'sto.login',
  requestedAt: '2024-01-01T00:00:00.000Z',
};

const baseStreamState: StreamState = {
  id: 'stream-001',
  version: 1,
  data: { session: { token: null } },
  updatedAt: '2024-01-01T00:00:00.000Z',
};

const stateDefinition: StateDefinition = {
  name: 'sample-state-definition',
  evaluate: async ({ changes }) => {
    const hasTokenChange = changes.changes.some((change) => change.type === 'set' && change.path === 'session.token');
    return hasTokenChange
      ? { valid: true, errors: [] }
      : { valid: false, errors: ['session.token must be set during execution'] };
  },
};

const flow: FlowDefinition = {
  key: 'flow.login',
  name: 'Login Flow',
  actions: [],
};

const sto: StateTransitionOperation = {
  id: 'sto-1',
  key: 'sto.login',
  version: '1.0.0',
  flowKey: flow.key,
  phase: 'execution',
};

const tenantProcess: TenantProcessDefinition = {
  id: 'tenant-1',
  key: baseRun.tenantProcessKey,
  version: baseRun.tenantProcessVersion,
  flows: { [flow.key]: flow },
  stos: { [sto.key]: sto },
  stateDefinition,
};

export const createRunRecord = (overrides: Partial<RunRecord> = {}): RunRecord => ({
  ...baseRun,
  ...overrides,
});

export const createStreamState = (overrides: Partial<StreamState> = {}): StreamState => ({
  ...baseStreamState,
  ...overrides,
});

export const createTenantProcess = (overrides: Partial<TenantProcessDefinition> = {}): TenantProcessDefinition => ({
  ...tenantProcess,
  ...overrides,
});

export class InMemoryStreamStateRepository implements StreamStateRepository {
  constructor(private readonly records: Record<string, StreamState>) {}

  async getById(id: string): Promise<StreamState | undefined> {
    return this.records[id];
  }
}

export class InMemoryTenantProcessRepository implements TenantProcessRepository {
  constructor(private readonly records: Record<string, TenantProcessDefinition>) {}

  async getById(id: string, version: string): Promise<TenantProcessDefinition | undefined> {
    const record = this.records[id];
    if (record && record.version === version) {
      return record;
    }
    return undefined;
  }
}

export const createSampleLoader = (
  overrides: Partial<ExecutionDataLoaderDependencies> = {},
): ExecutionDataLoader => {
  const dependencies: ExecutionDataLoaderDependencies = {
    streamStates: new InMemoryStreamStateRepository({ [baseStreamState.id]: baseStreamState }),
    tenantProcesses: new InMemoryTenantProcessRepository({ [tenantProcess.id]: tenantProcess }),
    ...overrides,
  };
  return new ExecutionDataLoader(dependencies);
};

export const createFrozenSnapshot = async (): Promise<ExecutionSnapshot> => {
  const loader = createSampleLoader();
  return loader.load(baseRun);
};

export const sampleFlow = flow;
export const sampleStateDefinition = stateDefinition;
