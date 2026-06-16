import type { StateDefinition } from '../../definitionRuntime/state/index.js';
import type { Logger } from '../contracts/logger.js';
import type { StateWriter } from '../contracts/stateWriter.js';
import type {
  Flow as CanonicalFlow,
  FlowExecutionResult,
  FlowRef,
  STO as CanonicalSTO,
  STORef,
  TenantProcessSelector as CanonicalTenantProcessSelector,
} from '../tenantProcess/index.js';

export type StreamStateData = Record<string, unknown>;
export type RunStatus = 'planned' | 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
export type PlannerQueueStatus = 'queued' | 'claimed' | 'completed' | 'failed' | 'cancelled';
export type StateTransitionPhase = 'planning' | 'execution';

export interface StreamState {
  readonly id: string;
  readonly streamId: string;
  readonly version: number;
  readonly tenantProcessId: string;
  readonly tenantProcessKey: string;
  readonly tenantProcessVersion: string;
  readonly data: StreamStateData;
  readonly createdAt?: string;
  readonly updatedAt?: string;
}

export interface StateTransitionOperation extends Omit<CanonicalSTO, 'stoId' | 'flowRef' | 'taskRef'> {
  readonly id: STORef;
  readonly key: STORef;
  readonly version: string;
  readonly phase: StateTransitionPhase;
  readonly flowKey: FlowRef;
  readonly description?: string;
  readonly taskRef?: string;
}

export interface StoRejection {
  readonly sto: StateTransitionOperation;
  readonly reason: string;
}

export interface StoEvaluationResult {
  readonly candidates: readonly StateTransitionOperation[];
  readonly rejected: readonly StoRejection[];
}

export interface FlowActionContext {
  readonly ctx: {
    readonly logger: Logger;
    readonly stateWriter: StateWriter;
  };
}

export interface FlowActionDefinition {
  readonly key: string;
  readonly description?: string;
  run(context: FlowActionContext): Promise<FlowExecutionResult> | FlowExecutionResult;
}

export interface FlowDefinition extends Omit<CanonicalFlow, 'flowId' | 'executable'> {
  readonly key: FlowRef;
  readonly name?: string;
  readonly description?: string;
  readonly actions: readonly FlowActionDefinition[];
}

export interface TenantProcessRuntime {
  readonly id: string;
  readonly tenantId?: string;
  readonly key: string;
  readonly version: string;
  readonly stateDefinition: StateDefinition;
  readonly stos: Readonly<Record<string, StateTransitionOperation>>;
  readonly flows: Readonly<Record<string, FlowDefinition>>;
  readonly selectors: Readonly<Record<string, TenantProcessSelector<StateTransitionOperation>>>;
  readonly validators?: Readonly<Record<string, unknown>>;
  readonly mappers?: Readonly<Record<string, unknown>>;
}

export interface RunRecord {
  readonly id: string;
  readonly streamId: string;
  readonly streamStateId: string;
  readonly stateVersion: number;
  readonly tenantProcessId: string;
  readonly tenantProcessKey: string;
  readonly tenantProcessVersion: string;
  readonly stoKey: string;
  readonly status?: RunStatus;
  readonly requestedAt: string;
  readonly startedAt?: string;
  readonly completedAt?: string;
}

export interface PlannerQueueRecord {
  readonly id: string;
  readonly streamId: string;
  readonly stoId: string;
  readonly stoKey: string;
  readonly stoVersion: string;
  readonly tenantProcessId: string;
  readonly tenantProcessVersion: string;
  readonly runId: string;
  readonly status?: PlannerQueueStatus;
  readonly queuedAt?: string;
}

export interface PlannerDecision {
  readonly streamId: string;
  readonly streamStateId: string;
  readonly stateVersion: number;
  readonly sto: StateTransitionOperation;
  readonly run: RunRecord;
  readonly intent?: PlannerQueueRecord;
  readonly created: boolean;
  readonly rejected: readonly StoRejection[];
}

export type TenantProcessSelector<TSto = StateTransitionOperation> = CanonicalTenantProcessSelector<TSto>;
