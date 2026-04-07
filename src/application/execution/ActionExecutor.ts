import type { ExecutionContext } from '../../domain/contracts/executionContext.ts';
import type { ExecutionSnapshot, FlowActionDefinition } from '../../domain/entities/execution.ts';
import { ActionExecutionError } from './errors.js';

const now = () => new Date().toISOString();

export interface ActionExecutorOptions {
  clock?: () => string;
}

export interface ActionExecutionStep {
  readonly actionKey: string;
  readonly description?: string;
  readonly status: 'success' | 'failed';
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly message?: string;
  readonly metadata?: Record<string, unknown>;
  readonly error?: Error;
}

export interface ActionExecutorResult {
  readonly flowKey: string;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly steps: readonly ActionExecutionStep[];
}

export interface ActionExecutorInput {
  readonly ctx: ExecutionContext;
  readonly snapshot: ExecutionSnapshot;
}

const resolveClock = (options?: ActionExecutorOptions) => options?.clock ?? now;

export class ActionExecutor {
  private readonly clock: () => string;

  constructor(options: ActionExecutorOptions = {}) {
    this.clock = resolveClock(options);
  }

  async execute({ ctx, snapshot }: ActionExecutorInput): Promise<ActionExecutorResult> {
    const steps: ActionExecutionStep[] = [];
    const startedAt = this.clock();

    for (const action of snapshot.flow.actions) {
      await this.executeAction(action, { ctx, snapshot }, steps);
    }

    const finishedAt = this.clock();
    return {
      flowKey: snapshot.flow.key,
      startedAt,
      finishedAt,
      steps,
    };
  }

  private async executeAction(
    action: FlowActionDefinition,
    context: ActionExecutorInput,
    steps: ActionExecutionStep[],
  ): Promise<void> {
    const stepStart = this.clock();
    try {
      const result = await action.run({ ctx: context.ctx, snapshot: context.snapshot });
      const stepFinish = this.clock();
      steps.push({
        actionKey: action.key,
        description: action.description,
        status: 'success',
        startedAt: stepStart,
        finishedAt: stepFinish,
        message: result?.message,
        metadata: result?.metadata,
      });
    } catch (error) {
      const stepFinish = this.clock();
      const failure: ActionExecutionStep = {
        actionKey: action.key,
        description: action.description,
        status: 'failed',
        startedAt: stepStart,
        finishedAt: stepFinish,
        error: error as Error,
      };
      steps.push(failure);
      throw new ActionExecutionError('Flow action failed', [
        {
          actionKey: failure.actionKey,
          startedAt: failure.startedAt,
          finishedAt: failure.finishedAt,
          error: failure.error!,
        },
      ]);
    }
  }
}
