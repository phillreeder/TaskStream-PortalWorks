import { describe, expect, it } from 'vitest';
import { ExecutionGuard } from '../ExecutionGuard.js';
import { ExecutionGuardError } from '../errors.js';
import { createRunRecord, createStreamState, createTenantProcess } from './fixtures.js';
import { createExecutionContext } from '../../execution/createExecutionContext.js';
import type { ExecutionSnapshot } from '../../../domain/entities/execution.ts';

describe('ExecutionGuard', () => {
  it('enforces immutability before execution', () => {
    const tenantProcess = createTenantProcess();
    const snapshot: ExecutionSnapshot = {
      run: createRunRecord(),
      streamState: createStreamState(),
      tenantProcess,
      sto: tenantProcess.stos['sto.login'],
      flow: tenantProcess.flows['flow.login'],
    };

    const guard = new ExecutionGuard(snapshot);

    expect(() => guard.ensureSnapshotIntegrity()).toThrow(ExecutionGuardError);
  });

  it('rejects planning STOs during execution', () => {
    const tenantProcess = createTenantProcess({
      stos: {
        'sto.login': {
          id: 'sto-1',
          key: 'sto.login',
          version: '1.0.0',
          flowKey: 'flow.login',
          phase: 'planning',
        },
      },
    });
    const snapshot: ExecutionSnapshot = {
      run: createRunRecord(),
      streamState: createStreamState(),
      tenantProcess,
      sto: tenantProcess.stos['sto.login'],
      flow: tenantProcess.flows['flow.login'],
    };

    const guard = new ExecutionGuard(snapshot);
    expect(() => guard.ensureExecutionPhase()).toThrow(ExecutionGuardError);
  });

  it('requires pristine state writers', async () => {
    const tenantProcess = createTenantProcess();
    const snapshot: ExecutionSnapshot = {
      run: createRunRecord(),
      streamState: createStreamState(),
      tenantProcess,
      sto: tenantProcess.stos['sto.login'],
      flow: tenantProcess.flows['flow.login'],
    };
    const ctx = await createExecutionContext();
    ctx.stateWriter.queue({ type: 'set', path: 'foo', value: 'bar' });

    const guard = new ExecutionGuard(snapshot);

    expect(() => guard.ensureStateWriterPristine(ctx)).toThrow(ExecutionGuardError);
  });
});
