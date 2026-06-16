import type {
  PlannerDecision,
  PlannerQueueRecord,
  RunRecord,
  StateTransitionOperation,
  StoRejection,
  StreamState,
  TenantProcessRuntime,
} from '../../domain/entities/execution.js';
import { evaluateStos, selectDeterministicSto } from '../../domain/logic/evaluators/StoEvaluator.js';
import { validateState } from '../../domain/logic/evaluators/StateDefinitionValidator.js';
import type { PlannerQueueRepository } from '../contracts/PlannerQueueRepository.js';
import type { RunRepository } from '../contracts/RunRepository.js';
import type { StreamStateRepository } from '../contracts/StreamStateRepository.js';
import type { TenantProcessRepository } from '../contracts/TenantProcessRepository.js';
import { RunPlannerError } from './errors.js';

export interface RunPlannerDependencies {
  streamStates: StreamStateRepository;
  tenantProcesses: TenantProcessRepository;
  runs: RunRepository;
  plannerQueue: PlannerQueueRepository;
}

export interface RunPlannerOptions {
  selectorKey?: string;
  clock?: () => string;
}

const now = () => new Date().toISOString();

export class RunPlanner {
  private readonly selectorKey: string;
  private readonly clock: () => string;

  constructor(private readonly deps: RunPlannerDependencies, options: RunPlannerOptions = {}) {
    this.selectorKey = options.selectorKey ?? 'default';
    this.clock = options.clock ?? now;
  }

  async planRun(streamId: string): Promise<PlannerDecision> {
    const streamState = await this.resolveStreamState(streamId);
    const tenantProcess = await this.resolveTenantProcess(streamState);
    this.assertTenantBinding(streamState, tenantProcess);
    this.validateStreamState(streamState, tenantProcess);

    const evaluation = evaluateStos({ streamState, tenantProcess });
    if (evaluation.candidates.length === 0) {
      throw new RunPlannerError('No applicable STOs were found for the current state', 'NO_ELIGIBLE_STO');
    }

    const sto = this.selectSto(streamState, tenantProcess, evaluation.candidates);
    const existingRun = await this.deps.runs.findByStateVersion(streamId, sto.key, streamState.version);
    if (existingRun) {
      return this.buildDecision({
        streamState,
        sto,
        run: existingRun,
        rejected: evaluation.rejected,
        created: false,
      });
    }

    const run = await this.deps.runs.create({
      streamId,
      streamStateId: streamState.id,
      stateVersion: streamState.version,
      tenantProcessId: tenantProcess.id,
      tenantProcessKey: tenantProcess.key,
      tenantProcessVersion: tenantProcess.version,
      stoKey: sto.key,
      requestedAt: this.clock(),
    });

    const intent = await this.deps.plannerQueue.enqueue({
      streamId,
      stoId: sto.id,
      stoKey: sto.key,
      stoVersion: sto.version,
      tenantProcessId: tenantProcess.id,
      tenantProcessVersion: tenantProcess.version,
      runId: run.id,
    });

    return this.buildDecision({ streamState, sto, run, intent, rejected: evaluation.rejected, created: true });
  }

  private buildDecision({
    streamState,
    sto,
    run,
    intent,
    rejected,
    created,
  }: {
    streamState: StreamState;
    sto: StateTransitionOperation;
    run: RunRecord;
    intent?: PlannerQueueRecord;
    rejected: readonly StoRejection[];
    created: boolean;
  }): PlannerDecision {
    return {
      streamId: streamState.streamId,
      streamStateId: streamState.id,
      stateVersion: streamState.version,
      sto,
      run,
      intent,
      created,
      rejected,
    };
  }

  private async resolveStreamState(streamId: string): Promise<StreamState> {
    const streamState = await this.deps.streamStates.getLatestByStreamId(streamId);
    if (!streamState) {
      throw new RunPlannerError(`Stream ${streamId} has no recorded state`, 'STREAM_STATE_NOT_FOUND');
    }
    if (streamState.streamId !== streamId) {
      throw new RunPlannerError(`Resolved stream state does not belong to stream ${streamId}`, 'STREAM_STATE_NOT_FOUND');
    }
    return streamState;
  }

  private async resolveTenantProcess(streamState: StreamState): Promise<TenantProcessRuntime> {
    const tenantProcess = await this.deps.tenantProcesses.getById(
      streamState.tenantProcessId,
      streamState.tenantProcessVersion,
    );
    if (!tenantProcess) {
      throw new RunPlannerError(
        `Tenant process ${streamState.tenantProcessId}@${streamState.tenantProcessVersion} was not found`,
        'TENANT_PROCESS_NOT_FOUND',
      );
    }
    return tenantProcess;
  }

  private assertTenantBinding(streamState: StreamState, tenantProcess: TenantProcessRuntime): void {
    if (tenantProcess.key !== streamState.tenantProcessKey) {
      throw new RunPlannerError(
        `Stream state expects tenant process key ${streamState.tenantProcessKey} but resolved ${tenantProcess.key}`,
        'TENANT_PROCESS_MISMATCH',
      );
    }
  }

  private validateStreamState(streamState: StreamState, tenantProcess: TenantProcessRuntime): void {
    const result = validateState(streamState.data, tenantProcess.stateDefinition, {
      phase: 'pre',
    });
    if (!result.valid) {
      const message =
        result.errors && result.errors.length > 0
          ? `Stream state failed validation: ${result.errors.join('; ')}`
          : 'Stream state failed validation';
      throw new RunPlannerError(message, 'STATE_INVALID');
    }
  }

  private selectSto(
    streamState: StreamState,
    tenantProcess: TenantProcessRuntime,
    candidates: readonly StateTransitionOperation[],
  ): StateTransitionOperation {
    const selector = tenantProcess.selectors[this.selectorKey] ?? tenantProcess.selectors.default;
    return selectDeterministicSto({
      context: {
        streamState,
        tenantProcess,
        candidates,
      },
      selector,
    });
  }
}
