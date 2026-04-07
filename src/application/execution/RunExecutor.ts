import type { ExecutionContext } from '../../domain/contracts/executionContext.ts';
import type { StateChangeBatch } from '../../domain/contracts/stateWriter.ts';
import type { ExecutionSnapshot, RunRecord, StateValidationResult } from '../../domain/entities/execution.ts';
import { validateState } from '../../domain/logic/evaluators/StateDefinitionValidator.ts';
import type { ActionExecutorInput, ActionExecutorResult } from './ActionExecutor.ts';
import type { StoVerificationInput } from './STOResultVerifier.ts';
import { ExecutionGuard } from './ExecutionGuard.js';
import { ExecutionGuardError, RunExecutionError } from './errors.js';

const now = () => new Date().toISOString();

export interface RunExecutorOptions {
  clock?: () => string;
}

export interface RunExecutionSummary {
  readonly runId: string;
  readonly snapshot: ExecutionSnapshot;
  readonly actions: ActionExecutorResult;
  readonly stateChanges: StateChangeBatch;
  readonly verification: StateValidationResult;
  readonly completedAt: string;
}

export interface ExecutionDataLoaderPort {
  load(run: RunRecord): Promise<ExecutionSnapshot>;
}

export interface ActionExecutorPort {
  execute(input: ActionExecutorInput): Promise<ActionExecutorResult>;
}

export interface StoResultVerifierPort {
  verify(input: StoVerificationInput): Promise<StateValidationResult>;
}

export interface RunExecutorDependencies {
  loader: ExecutionDataLoaderPort;
  actions: ActionExecutorPort;
  verifier: StoResultVerifierPort;
}

export class RunExecutor {
  private readonly clock: () => string;
  private readonly deps: RunExecutorDependencies;

  constructor(deps: RunExecutorDependencies, options: RunExecutorOptions = {}) {
    this.deps = deps;
    this.clock = options.clock ?? now;
  }

  async execute(run: RunRecord, ctx: ExecutionContext): Promise<RunExecutionSummary> {
    const snapshot = await this.loadSnapshot(run);
    const guard = new ExecutionGuard(snapshot);

    this.validate(guard, ctx, snapshot);

    const actions = await this.executeFlow(snapshot, ctx);
    const stateChanges = await this.collectStateChanges(ctx);
    const verification = await this.verify(snapshot, stateChanges);

    guard.ensureStateWriterFlushed(ctx);

    return {
      runId: run.id,
      snapshot,
      actions,
      stateChanges,
      verification,
      completedAt: this.clock(),
    };
  }

  private async loadSnapshot(run: RunRecord): Promise<ExecutionSnapshot> {
    try {
      return await this.deps.loader.load(run);
    } catch (error) {
      throw new RunExecutionError('Execution snapshot could not be built', 'validate', { cause: error as Error });
    }
  }

  private validate(guard: ExecutionGuard, ctx: ExecutionContext, snapshot: ExecutionSnapshot): void {
    try {
      guard.ensureSnapshotIntegrity();
      guard.ensureExecutionPhase();
      guard.ensureStateWriterPristine(ctx);
      this.ensurePreExecutionValidation(snapshot);
    } catch (error) {
      if (error instanceof ExecutionGuardError) {
        throw new RunExecutionError(error.message, 'validate', { cause: error });
      }
      throw error;
    }
  }

  private ensurePreExecutionValidation(snapshot: ExecutionSnapshot): void {
    const result = validateState(snapshot.streamState.data, snapshot.tenantProcess.stateDefinition, {
      phase: 'pre',
      stoKey: snapshot.sto.key,
    });

    if (!result.valid) {
      const message =
        result.errors && result.errors.length > 0
          ? `Stream state failed validation: ${result.errors.join('; ')}`
          : 'Stream state failed validation';
      throw new RunExecutionError(message, 'validate');
    }

    const stoRules = snapshot.tenantProcess.stateDefinition.stos;
    const rule = stoRules?.[snapshot.sto.key];
    if (rule && !rule.when(snapshot.streamState.data, snapshot.sto)) {
      throw new RunExecutionError(
        rule.errorMessage ?? `STO ${snapshot.sto.key} is not applicable to the current state`,
        'validate',
      );
    }
  }

  private async executeFlow(snapshot: ExecutionSnapshot, ctx: ExecutionContext): Promise<ActionExecutorResult> {
    try {
      return await this.deps.actions.execute({ ctx, snapshot });
    } catch (error) {
      ctx.stateWriter.reset();
      throw new RunExecutionError('Flow execution failed', 'execute', { cause: error as Error });
    }
  }

  private async collectStateChanges(ctx: ExecutionContext): Promise<StateChangeBatch> {
    try {
      return await ctx.stateWriter.flush();
    } catch (error) {
      ctx.stateWriter.reset();
      throw new RunExecutionError('Failed to finalize state changes', 'finalize', { cause: error as Error });
    }
  }

  private async verify(snapshot: ExecutionSnapshot, changes: StateChangeBatch): Promise<StateValidationResult> {
    try {
      return await this.deps.verifier.verify({ snapshot, changes });
    } catch (error) {
      if (!(error instanceof RunExecutionError)) {
        throw new RunExecutionError('State verification failed', 'verify', { cause: error as Error });
      }
      throw error;
    }
  }
}
