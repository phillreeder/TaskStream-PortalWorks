import { describe, expect, it } from 'vitest';
import type {
  FlowActionDefinition,
  FlowDefinition,
  StateDefinition,
  StateTransitionOperation,
  TenantProcessConfig,
} from '../../../entities/execution.ts';
import { TenantProcessValidationError } from '../../evaluators/TenantProcessValidator.ts';
import { normalizeTenantProcess } from '../normalizeTenantProcess.ts';

const noopAction: FlowActionDefinition = {
  key: 'action.test.noop',
  run: () => ({ status: 'success' }) as const,
};

const createFlow = (key: string): FlowDefinition => ({
  key,
  name: key,
  actions: [noopAction],
});

const createSto = (key: string, flowKey: string): StateTransitionOperation => ({
  id: `${key}.id`,
  key,
  version: '1.0.0',
  phase: 'execution',
  flowKey,
});

const baseStateDefinition: StateDefinition = {
  name: 'state.test',
  schema: {
    properties: {},
  },
};

const createConfig = (overrides: Partial<TenantProcessConfig> = {}): TenantProcessConfig => {
  const flow = createFlow('flow.test.default');
  const sto = createSto('sto.test.default', flow.key);
  const config: TenantProcessConfig = {
    id: 'tenant.process.test',
    key: 'tenant.test.default',
    version: '1.0.0',
    flows: { [flow.key]: flow },
    stos: { [sto.key]: sto },
    stateDefinition: baseStateDefinition,
    validators: { onboarding: { name: 'validator.test' } },
    mappers: { session: { name: 'mapper.test' } },
    selectors: { default: { name: 'selector.test' } },
  };
  return { ...config, ...overrides };
};

describe('normalizeTenantProcess', () => {
  it('normalizes a valid config into runtime maps', () => {
    const runtime = normalizeTenantProcess(createConfig());
    expect(runtime.flows.get('flow.test.default')?.name).toBe('flow.test.default');
    expect(runtime.stos.get('sto.test.default')?.flowKey).toBe('flow.test.default');
    expect(runtime.stateDefinition.name).toBe('state.test');
    expect(runtime.validators).toHaveProperty('onboarding');
  });

  it('throws when a STO references a missing flow', () => {
    const flow = createFlow('flow.a');
    const sto = createSto('sto.a', 'flow.missing');
    const config = createConfig({
      flows: { [flow.key]: flow },
      stos: { [sto.key]: sto },
    });
    expect(() => normalizeTenantProcess(config)).toThrow(TenantProcessValidationError);
  });

  it('throws when no STO definitions exist', () => {
    const config = createConfig({ stos: {} });
    expect(() => normalizeTenantProcess(config)).toThrow(/must declare at least one STO/);
  });

  it('throws when state definition is missing', () => {
    const config = createConfig({ stateDefinition: undefined });
    expect(() => normalizeTenantProcess(config)).toThrow(/stateDefinition/);
  });

  it('throws when duplicate STO ids exist', () => {
    const flowA = createFlow('flow.a');
    const stoA = createSto('sto.a', flowA.key);
    const stoB: StateTransitionOperation = { ...createSto('sto.b', flowA.key), id: stoA.id };
    const config = createConfig({
      flows: { [flowA.key]: flowA },
      stos: { [stoA.key]: stoA, [stoB.key]: stoB },
    });
    expect(() => normalizeTenantProcess(config)).toThrow(/Duplicate STO id/);
  });

  it('throws when flow records are not objects', () => {
    const config = createConfig({ flows: { invalid: null as unknown as FlowDefinition } });
    expect(() => normalizeTenantProcess(config)).toThrow(/Flow invalid must be an object definition/);
  });

  it('indexes flows and stos deterministically', () => {
    const flow = createFlow('flow.indexed');
    const sto = createSto('sto.indexed', flow.key);
    const config = createConfig({
      flows: { [flow.key]: flow },
      stos: { [sto.key]: sto },
    });
    const runtime = normalizeTenantProcess(config);
    const keys = Array.from(runtime.flows.keys());
    expect(keys).toEqual(['flow.indexed']);
  });

  it('produces identical runtime output for identical input', () => {
    const config = createConfig();
    const first = normalizeTenantProcess(config);
    const second = normalizeTenantProcess(config);
    expect(Array.from(first.flows.entries())).toEqual(Array.from(second.flows.entries()));
    expect(Array.from(first.stos.entries())).toEqual(Array.from(second.stos.entries()));
  });

  it('enforces immutability on the runtime object', () => {
    const runtime = normalizeTenantProcess(createConfig());
    expect(Object.isFrozen(runtime)).toBe(true);
    expect(() =>
      (runtime.flows as Map<string, FlowDefinition>).set('flow.extra', createFlow('flow.extra')),
    ).toThrow();
  });

  it('exposes runtime data required for execution snapshots', () => {
    const runtime = normalizeTenantProcess(createConfig());
    const sto = runtime.stos.get('sto.test.default');
    const flow = runtime.flows.get(sto!.flowKey);
    expect(flow?.actions).toHaveLength(1);
  });

  it('handles large tenant process configs', () => {
    const flows: Record<string, FlowDefinition> = {};
    const stos: Record<string, StateTransitionOperation> = {};
    for (let i = 0; i < 50; i += 1) {
      const flowKey = `flow.large.${i}`;
      const stoKey = `sto.large.${i}`;
      flows[flowKey] = createFlow(flowKey);
      stos[stoKey] = createSto(stoKey, flowKey);
    }
    const runtime = normalizeTenantProcess(createConfig({ flows, stos }));
    expect(runtime.flows.size).toBe(50);
    expect(runtime.stos.size).toBe(50);
  });

  it('rejects configs missing the flows export entirely', () => {
    const config = createConfig({ flows: undefined });
    expect(() => normalizeTenantProcess(config)).toThrow(/flows must be an object/);
  });
});
