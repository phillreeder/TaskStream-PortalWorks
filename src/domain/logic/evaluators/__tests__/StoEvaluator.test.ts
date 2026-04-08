import { describe, expect, it } from 'vitest';
import type {
  StateTransitionOperation,
  StreamState,
  TenantProcessRuntime,
  TenantProcessSelector,
} from '../../../entities/execution.ts';
import { evaluateStos, selectDeterministicSto, StoSelectionError } from '../StoEvaluator.ts';

const createSto = (key: string, flowKey: string): StateTransitionOperation => ({
  id: `${key}.id`,
  key,
  version: '1.0.0',
  phase: 'execution',
  flowKey,
});

const createTenantProcess = (): TenantProcessRuntime => {
  const flowKey = 'flow.default';
  const stoReady = createSto('sto.ready', flowKey);
  const stoFinalize = createSto('sto.finalize', flowKey);
  return {
    id: 'tenant-1',
    key: 'tenant.alpha',
    version: '1.0.0',
    flows: new Map([[flowKey, { key: flowKey, name: 'Default Flow', actions: [] }]]),
    stos: new Map([
      [stoReady.key, stoReady],
      [stoFinalize.key, stoFinalize],
    ]),
    stateDefinition: {
      name: 'state.test',
      schema: { properties: {} },
      stos: {
        [stoReady.key]: {
          stoKey: stoReady.key,
          when: (state) => !((state.session ?? {}) as Record<string, unknown>).ready,
          errorMessage: 'ready STO applies only before ready flag is set',
        },
        [stoFinalize.key]: {
          stoKey: stoFinalize.key,
          when: (state) => Boolean((state.session ?? {}) as Record<string, unknown>).ready,
        },
      },
    },
    validators: {},
    mappers: {},
    selectors: {},
  };
};

const createStreamState = (overrides: Partial<StreamState> = {}): StreamState => ({
  id: 'state-001',
  streamId: 'stream-001',
  tenantProcessId: 'tenant-1',
  tenantProcessKey: 'tenant.alpha',
  tenantProcessVersion: '1.0.0',
  version: 1,
  data: { session: { ready: false } },
  updatedAt: '2024-01-01T00:00:00.000Z',
  ...overrides,
});

describe('evaluateStos', () => {
  it('returns applicable STOs and rejections', () => {
    const tenantProcess = createTenantProcess();
    const streamState = createStreamState();

    const result = evaluateStos({ streamState, tenantProcess });

    expect(result.candidates.map((sto) => sto.key)).toEqual(['sto.ready']);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.reason).toContain('not applicable');
  });
});

describe('selectDeterministicSto', () => {
  it('returns the single candidate without consulting selectors', () => {
    const tenantProcess = createTenantProcess();
    const streamState = createStreamState();
    const evaluation = evaluateStos({ streamState, tenantProcess });
    const context = { streamState, tenantProcess, candidates: evaluation.candidates };

    const selected = selectDeterministicSto({ context });

    expect(selected.key).toBe('sto.ready');
  });

  it('uses tenant selectors when multiple candidates exist', () => {
    const tenantProcess = createTenantProcess();
    const streamState = createStreamState({ data: { session: { ready: true } } });
    const selector: TenantProcessSelector = {
      name: 'choose.finalize',
      select: ({ candidates }) => candidates.find((candidate) => candidate.key === 'sto.finalize'),
    };

    const selected = selectDeterministicSto({
      context: { streamState, tenantProcess, candidates: Array.from(tenantProcess.stos.values()) },
      selector,
    });

    expect(selected.key).toBe('sto.finalize');
  });

  it('throws when selector returns invalid STO', () => {
    const tenantProcess = createTenantProcess();
    const streamState = createStreamState({ data: { session: { ready: true } } });
    const evaluation = evaluateStos({ streamState, tenantProcess });
    const selector: TenantProcessSelector = {
      name: 'broken',
      select: () => createSto('sto.unknown', 'flow.default'),
    };

    expect(() =>
      selectDeterministicSto({ context: { streamState, tenantProcess, candidates: evaluation.candidates }, selector }),
    ).toThrow(StoSelectionError);
  });
});
