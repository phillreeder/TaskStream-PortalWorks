import { describe, expect, it } from 'vitest';
import { RunExecutor } from '../RunExecutor.js';
import { ActionExecutor } from '../ActionExecutor.js';
import { STOResultVerifier } from '../STOResultVerifier.js';
import {
  createSampleLoader,
  createTenantProcess,
  createRunRecord,
  InMemoryTenantProcessRepository,
  InMemoryStreamStateRepository,
  createStreamState,
} from './fixtures.js';
import { createExecutionContext } from '../../execution/createExecutionContext.js';
import type { FlowActionDefinition } from '../../../domain/entities/execution.ts';
import { ExecutionDataLoader } from '../ExecutionDataLoader.js';
import { RunExecutionError } from '../errors.js';

const tickClock = () => {
  let counter = 0;
  return () => new Date(Date.UTC(2024, 0, 1, 0, 0, counter++)).toISOString();
};

const buildLoaderWithFlow = (actions: FlowActionDefinition[]) => {
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
  });

  return new ExecutionDataLoader({
    streamStates: new InMemoryStreamStateRepository({ 'stream-001': createStreamState() }),
    tenantProcesses: new InMemoryTenantProcessRepository({ [tenantProcess.id]: tenantProcess }),
  });
};

describe('RunExecutor', () => {
  it('executes, verifies, and finalizes a run', async () => {
    const actions: FlowActionDefinition[] = [
      {
        key: 'write-token',
        async run({ ctx }) {
          ctx.stateWriter.queue({ type: 'set', path: 'session.token', value: 'abc123' });
          return { status: 'success' };
        },
      },
    ];

    const loader = buildLoaderWithFlow(actions);
    const executor = new RunExecutor(
      {
        loader,
        actions: new ActionExecutor({ clock: tickClock() }),
        verifier: new STOResultVerifier(),
      },
      { clock: tickClock() },
    );

    const ctx = await createExecutionContext();
    const summary = await executor.execute(createRunRecord(), ctx);

    expect(summary.actions.steps).toHaveLength(1);
    expect(summary.stateChanges.changes).toHaveLength(1);
    expect(summary.verification.valid).toBe(true);
    expect(ctx.stateWriter.isDirty()).toBe(false);
  });

  it('fails verification when no state changes occur', async () => {
    const actions: FlowActionDefinition[] = [
      {
        key: 'noop',
        async run() {
          return { status: 'noop' };
        },
      },
    ];
    const loader = buildLoaderWithFlow(actions);
    const executor = new RunExecutor(
      {
        loader,
        actions: new ActionExecutor({ clock: tickClock() }),
        verifier: new STOResultVerifier(),
      },
      { clock: tickClock() },
    );
    const ctx = await createExecutionContext();

    await expect(executor.execute(createRunRecord(), ctx)).rejects.toBeInstanceOf(RunExecutionError);
  });

  it('rejects dirty contexts before execution', async () => {
    const loader = createSampleLoader();
    const executor = new RunExecutor(
      {
        loader,
        actions: new ActionExecutor({ clock: tickClock() }),
        verifier: new STOResultVerifier({ allowNoChanges: true }),
      },
      { clock: tickClock() },
    );
    const ctx = await createExecutionContext();
    ctx.stateWriter.queue({ type: 'set', path: 'foo', value: 'bar' });

    await expect(executor.execute(createRunRecord(), ctx)).rejects.toBeInstanceOf(RunExecutionError);
  });

  it('rejects runs when stream state fails validation', async () => {
    const invalidState = createStreamState({ data: {} as Record<string, unknown> });
    const loader = createSampleLoader({
      streamStates: new InMemoryStreamStateRepository({ [invalidState.id]: invalidState }),
    });
    const executor = new RunExecutor(
      {
        loader,
        actions: new ActionExecutor({ clock: tickClock() }),
        verifier: new STOResultVerifier({ allowNoChanges: true }),
      },
      { clock: tickClock() },
    );
    const ctx = await createExecutionContext();

    await expect(
      executor.execute(createRunRecord({ streamStateId: invalidState.id }), ctx),
    ).rejects.toBeInstanceOf(RunExecutionError);
  });

  it('rejects runs when STO is not applicable to the current state', async () => {
    const blockedState = createStreamState({ data: { session: { token: 'existing-token' } } });
    const loader = createSampleLoader({
      streamStates: new InMemoryStreamStateRepository({ [blockedState.id]: blockedState }),
    });
    const executor = new RunExecutor(
      {
        loader,
        actions: new ActionExecutor({ clock: tickClock() }),
        verifier: new STOResultVerifier({ allowNoChanges: true }),
      },
      { clock: tickClock() },
    );
    const ctx = await createExecutionContext();

    await expect(
      executor.execute(createRunRecord({ streamStateId: blockedState.id }), ctx),
    ).rejects.toBeInstanceOf(RunExecutionError);
  });
});
