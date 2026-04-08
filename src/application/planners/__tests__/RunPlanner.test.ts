import { describe, expect, it } from 'vitest';
import { RunPlanner } from '../RunPlanner.js';
import { RunPlannerError } from '../errors.js';
import {
  createStreamState,
  createTenantProcess,
  createRunRecord,
} from '../../execution/__tests__/fixtures.js';
import type {
  PlannerQueueRecord,
  RunRecord,
  StateTransitionOperation,
  StreamState,
  TenantProcessRuntime,
  TenantProcessSelector,
} from '../../../domain/entities/execution.ts';
import type { StreamStateRepository } from '../../contracts/StreamStateRepository.ts';
import type { TenantProcessRepository } from '../../contracts/TenantProcessRepository.ts';
import type { CreateRunInput, RunRepository } from '../../contracts/RunRepository.ts';
import type { PlannerQueueCreateInput, PlannerQueueRepository } from '../../contracts/PlannerQueueRepository.ts';

class StubStreamStateRepository implements StreamStateRepository {
  constructor(private states: StreamState[]) {}

  setStates(states: StreamState[]): void {
    this.states = [...states];
  }

  async getById(id: string): Promise<StreamState | undefined> {
    return this.states.find((state) => state.id === id);
  }

  async getLatestByStreamId(streamId: string): Promise<StreamState | undefined> {
    const matches = this.states.filter((state) => state.streamId === streamId);
    if (matches.length === 0) {
      return undefined;
    }
    return matches.reduce((latest, candidate) => (candidate.version > latest.version ? candidate : latest));
  }
}

class StubTenantProcessRepository implements TenantProcessRepository {
  constructor(private readonly records: Map<string, TenantProcessRuntime>) {}

  async getById(id: string, version: string): Promise<TenantProcessRuntime | undefined> {
    const runtime = this.records.get(id);
    if (runtime && runtime.version === version) {
      return runtime;
    }
    return undefined;
  }
}

class StubRunRepository implements RunRepository {
  constructor(private readonly runs: RunRecord[] = []) {}

  async create(input: CreateRunInput): Promise<RunRecord> {
    const run: RunRecord = {
      id: 'run-' + (this.runs.length + 1),
      streamId: input.streamId,
      streamStateId: input.streamStateId,
      stateVersion: input.stateVersion,
      tenantProcessId: input.tenantProcessId,
      tenantProcessKey: input.tenantProcessKey,
      tenantProcessVersion: input.tenantProcessVersion,
      stoKey: input.stoKey,
      requestedAt: input.requestedAt,
      metadata: input.metadata,
    };
    this.runs.push(run);
    return run;
  }

  async findByStateVersion(streamId: string, stoKey: string, stateVersion: number): Promise<RunRecord | undefined> {
    return this.runs.find(
      (run) => run.streamId === streamId && run.stoKey === stoKey && run.stateVersion === stateVersion,
    );
  }

  get all(): readonly RunRecord[] {
    return this.runs;
  }
}

class StubPlannerQueueRepository implements PlannerQueueRepository {
  constructor(private readonly clock: () => string, private readonly entries: PlannerQueueRecord[] = []) {}

  async enqueue(input: PlannerQueueCreateInput): Promise<PlannerQueueRecord> {
    const entry: PlannerQueueRecord = {
      id: 'intent-' + (this.entries.length + 1),
      status: 'pending',
      createdAt: this.clock(),
      ...input,
    };
    this.entries.push(entry);
    return entry;
  }

  get all(): readonly PlannerQueueRecord[] {
    return this.entries;
  }
}

const fixedClock = () => '2024-01-01T00:00:00.000Z';

const buildPlanner = ({
  streamStates = [createStreamState()],
  tenantProcess = createTenantProcess(),
  runRepo = new StubRunRepository(),
  queueRepo = new StubPlannerQueueRepository(fixedClock),
  selectorKey,
  clock = fixedClock,
}: {
  streamStates?: StreamState[];
  tenantProcess?: TenantProcessRuntime;
  runRepo?: StubRunRepository;
  queueRepo?: StubPlannerQueueRepository;
  selectorKey?: string;
  clock?: () => string;
} = {}) => {
  const streamRepo = new StubStreamStateRepository(streamStates);
  const tenantRepo = new StubTenantProcessRepository(new Map([[tenantProcess.id, tenantProcess]]));
  const planner = new RunPlanner(
    {
      streamStates: streamRepo,
      tenantProcesses: tenantRepo,
      runs: runRepo,
      plannerQueue: queueRepo,
    },
    { selectorKey, clock },
  );
  return { planner, streamRepo, tenantRepo, runRepo, queueRepo };
};

const createDualStoProcess = (): TenantProcessRuntime => {
  const initializeFlow = { key: 'flow.initialize', name: 'Initialize Flow', actions: [] };
  const finalizeFlow = { key: 'flow.finalize', name: 'Finalize Flow', actions: [] };
  const initializeSto: StateTransitionOperation = {
    id: 'sto.init',
    key: 'sto.init',
    version: '1.0.0',
    flowKey: initializeFlow.key,
    phase: 'execution',
  };
  const finalizeSto: StateTransitionOperation = {
    id: 'sto.finalize',
    key: 'sto.finalize',
    version: '1.0.0',
    flowKey: finalizeFlow.key,
    phase: 'execution',
  };

  return {
    id: 'tenant-1',
    key: 'tenant.alpha',
    version: '1.0.0',
    flows: new Map([
      [initializeFlow.key, initializeFlow],
      [finalizeFlow.key, finalizeFlow],
    ]),
    stos: new Map([
      [initializeSto.key, initializeSto],
      [finalizeSto.key, finalizeSto],
    ]),
    stateDefinition: {
      name: 'planner-state',
      schema: {
        properties: {
          session: {
            type: 'object',
            allowAdditionalProperties: true,
            properties: {
              ready: { type: 'boolean', nullable: true },
            },
          },
        },
      },
      stos: {
        [initializeSto.key]: {
          stoKey: initializeSto.key,
          when: (state) => !((state.session ?? {}) as Record<string, unknown>).ready,
        },
        [finalizeSto.key]: {
          stoKey: finalizeSto.key,
          when: (state) => Boolean(((state.session ?? {}) as Record<string, unknown>).ready),
        },
      },
    },
    validators: {},
    mappers: {},
    selectors: {},
  };
};

describe('RunPlanner', () => {
  it('creates a run and planner intent for a valid STO', async () => {
    const state = createStreamState({ id: 'state-001' });
    const process = createTenantProcess();
    const { planner, runRepo, queueRepo } = buildPlanner({ streamStates: [state], tenantProcess: process });

    const decision = await planner.planRun(state.streamId);

    expect(decision.created).toBe(true);
    expect(runRepo.all).toHaveLength(1);
    expect(queueRepo.all).toHaveLength(1);
    expect(queueRepo.all[0]?.stoKey).toBe(process.stos.keys().next().value);
  });

  it('uses tenant selectors when multiple STOs are valid', async () => {
    const baseProcess = createDualStoProcess();
    const initializeSto = baseProcess.stos.get('sto.init')!;
    const finalizeSto = baseProcess.stos.get('sto.finalize')!;
    const selector: TenantProcessSelector = {
      name: 'prefer-finalize',
      select: ({ candidates }) => candidates.find((candidate) => candidate.key === finalizeSto.key),
    };
    const process: TenantProcessRuntime = {
      ...baseProcess,
      stateDefinition: {
        ...baseProcess.stateDefinition,
        stos: {
          [initializeSto.key]: { stoKey: initializeSto.key, when: () => true },
          [finalizeSto.key]: { stoKey: finalizeSto.key, when: () => true },
        },
      },
      selectors: { default: selector },
    };
    const state = createStreamState({ data: { session: { ready: false } } });
    const { planner } = buildPlanner({ streamStates: [state], tenantProcess: process });

    const decision = await planner.planRun(state.streamId);

    expect(decision.sto.key).toBe(finalizeSto.key);
  });

  it('throws when no STO matches the current state', async () => {
    const process = createTenantProcess();
    const state = createStreamState({ data: { session: { token: 'exists' } } });
    const { planner } = buildPlanner({ streamStates: [state], tenantProcess: process });

    await expect(planner.planRun(state.streamId)).rejects.toThrowError(RunPlannerError);
  });

  it('tracks rejected STOs when filtering candidates', async () => {
    const process = createDualStoProcess();
    const state = createStreamState({ data: { session: { ready: false } } });
    const { planner } = buildPlanner({ streamStates: [state], tenantProcess: process });

    const decision = await planner.planRun(state.streamId);

    expect(decision.rejected).toHaveLength(1);
    expect(decision.rejected[0]?.sto.key).toBe('sto.finalize');
  });

  it('returns an existing run when planning is idempotent', async () => {
    const state = createStreamState();
    const process = createTenantProcess();
    const existingRun = createRunRecord({
      streamId: state.streamId,
      streamStateId: state.id,
      stateVersion: state.version,
    });
    const runRepo = new StubRunRepository([existingRun]);
    const queueRepo = new StubPlannerQueueRepository(fixedClock);
    const { planner } = buildPlanner({ streamStates: [state], tenantProcess: process, runRepo, queueRepo });

    const decision = await planner.planRun(state.streamId);

    expect(decision.created).toBe(false);
    expect(queueRepo.all).toHaveLength(0);
  });

  it('selects different STOs as the stream state evolves', async () => {
    const process = createDualStoProcess();
    const initialState = createStreamState({
      id: 'state-v1',
      version: 1,
      data: { session: { ready: false } },
    });
    const updatedState = createStreamState({
      id: 'state-v2',
      version: 2,
      data: { session: { ready: true } },
    });
    const { planner, streamRepo } = buildPlanner({ streamStates: [initialState], tenantProcess: process });

    const firstDecision = await planner.planRun(initialState.streamId);
    streamRepo.setStates([updatedState]);
    const secondDecision = await planner.planRun(initialState.streamId);

    expect(firstDecision.sto.key).toBe('sto.init');
    expect(secondDecision.sto.key).toBe('sto.finalize');
  });

  it('is deterministic for identical snapshots', async () => {
    const state = createStreamState();
    const process = createTenantProcess();
    const { planner, queueRepo } = buildPlanner({ streamStates: [state], tenantProcess: process });

    const first = await planner.planRun(state.streamId);
    const second = await planner.planRun(state.streamId);

    expect(first.sto.key).toBe(second.sto.key);
    expect(second.created).toBe(false);
    expect(queueRepo.all).toHaveLength(1);
  });

  it('does not mutate the resolved stream state snapshot', async () => {
    const state = createStreamState();
    const original = JSON.stringify(state.data);
    const { planner } = buildPlanner({ streamStates: [state], tenantProcess: createTenantProcess() });

    await planner.planRun(state.streamId);

    expect(JSON.stringify(state.data)).toBe(original);
  });

  it('populates planner queue entries with STO metadata', async () => {
    const state = createStreamState();
    const process = createTenantProcess();
    const { planner, queueRepo } = buildPlanner({ streamStates: [state], tenantProcess: process });

    await planner.planRun(state.streamId);

    expect(queueRepo.all[0]).toMatchObject({
      stoId: expect.any(String),
      runId: expect.any(String),
      tenantProcessId: process.id,
    });
  });

  it('throws when tenant process binding mismatches', async () => {
    const state = createStreamState({ tenantProcessKey: 'tenant.beta' });
    const process = createTenantProcess();
    const { planner } = buildPlanner({ streamStates: [state], tenantProcess: process });

    await expect(planner.planRun(state.streamId)).rejects.toThrowError(RunPlannerError);
  });

  it('throws when stream state fails validation', async () => {
    const invalidState = createStreamState({ data: {} as Record<string, unknown> });
    const process = createTenantProcess();
    const { planner } = buildPlanner({ streamStates: [invalidState], tenantProcess: process });

    await expect(planner.planRun(invalidState.streamId)).rejects.toThrowError(RunPlannerError);
  });

  it('throws when no stream state exists for the stream id', async () => {
    const { planner } = buildPlanner({ streamStates: [], tenantProcess: createTenantProcess() });

    await expect(planner.planRun('missing-stream')).rejects.toThrowError(RunPlannerError);
  });
});
