import { describe, expect, it } from 'vitest';
import { ActionExecutor } from '../ActionExecutor.js';
import type { FlowActionDefinition, ExecutionSnapshot } from '../../../domain/entities/execution.ts';
import { createRunRecord, createStreamState, createTenantProcess, sampleStateDefinition } from './fixtures.js';
import { createExecutionContext } from '../../execution/createExecutionContext.js';
import { ActionExecutionError } from '../errors.js';

const tickClock = () => {
  let counter = 0;
  return () => new Date(Date.UTC(2024, 0, 1, 0, 0, counter++)).toISOString();
};

const buildSnapshot = (actions: FlowActionDefinition[]): ExecutionSnapshot => {
  const run = createRunRecord();
  const streamState = createStreamState();
  const tenantProcess = createTenantProcess({
    flows: new Map([
      [
        'flow.login',
        {
          key: 'flow.login',
          name: 'Login Flow',
          actions,
        },
      ],
    ]),
    stos: new Map([
      [
        'sto.login',
        {
          id: 'sto-1',
          key: 'sto.login',
          version: '1.0.0',
          flowKey: 'flow.login',
          phase: 'execution',
        },
      ],
    ]),
    stateDefinition: sampleStateDefinition,
  });

  return {
    run,
    streamState,
    tenantProcess,
    sto: tenantProcess.stos.get('sto.login')!,
    flow: tenantProcess.flows.get('flow.login')!,
  };
};

describe('ActionExecutor', () => {
  it('executes all flow actions in order', async () => {
    const ctx = await createExecutionContext();
    const actions: FlowActionDefinition[] = [
      {
        key: 'open-page',
        async run({ ctx: actionCtx }) {
          await actionCtx.automation.open('https://example.com');
          return { status: 'success', message: 'opened' };
        },
      },
      {
        key: 'queue-state',
        async run({ ctx: actionCtx }) {
          actionCtx.stateWriter.queue({ type: 'set', path: 'session.token', value: 'abc123' });
          return { status: 'success', metadata: { step: 2 } };
        },
      },
    ];
    const snapshot = buildSnapshot(actions);
    const executor = new ActionExecutor({ clock: tickClock() });

    const result = await executor.execute({ ctx, snapshot });

    expect(result.steps).toHaveLength(2);
    expect(result.steps[0]).toMatchObject({ actionKey: 'open-page', status: 'success', message: 'opened' });
    expect(result.steps[1]).toMatchObject({ actionKey: 'queue-state', metadata: { step: 2 } });
    expect(ctx.automation.history()).toHaveLength(1);
  });

  it('stops execution when an action fails and surfaces error context', async () => {
    const ctx = await createExecutionContext();
    const actions: FlowActionDefinition[] = [
      {
        key: 'first',
        async run() {
          return { status: 'success' };
        },
      },
      {
        key: 'fail-step',
        async run() {
          throw new Error('Boom');
        },
      },
    ];
    const snapshot = buildSnapshot(actions);
    const executor = new ActionExecutor({ clock: tickClock() });

    await expect(executor.execute({ ctx, snapshot })).rejects.toBeInstanceOf(ActionExecutionError);
  });
});
