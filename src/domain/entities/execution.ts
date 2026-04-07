import type { ExecutionContext } from '../contracts/executionContext.ts';
import type { StateChangeBatch } from '../contracts/stateWriter.ts';

export interface RunRecord {
  readonly id: string;
  readonly streamStateId: string;
  readonly tenantProcessKey: string;
  readonly tenantProcessVersion: string;
  readonly stoKey: string;
  readonly requestedAt: string;
  readonly metadata?: Record<string, unknown>;
}

export interface StreamState {
  readonly id: string;
  readonly version: number;
  readonly data: Record<string, unknown>;
  readonly updatedAt: string;
}

export type StoPhase = 'planning' | 'execution';

export interface StateTransitionOperation {
  readonly id: string;
  readonly key: string;
  readonly version: string;
  readonly flowKey: string;
  readonly phase: StoPhase;
  readonly description?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface FlowActionResult {
  readonly status: 'success' | 'noop';
  readonly message?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface FlowActionContext {
  readonly ctx: ExecutionContext;
  readonly snapshot: ExecutionSnapshot;
}

export interface FlowActionDefinition<TResult = FlowActionResult> {
  readonly key: string;
  readonly description?: string;
  run(context: FlowActionContext): Promise<TResult> | TResult;
}

export interface FlowDefinition {
  readonly key: string;
  readonly name: string;
  readonly description?: string;
  readonly actions: readonly FlowActionDefinition[];
}

export interface StateValidationInput {
  readonly streamState: StreamState;
  readonly changes: StateChangeBatch;
  readonly sto: StateTransitionOperation;
  readonly tenantProcess: TenantProcessDefinition;
}

export interface StateValidationResult {
  readonly valid: boolean;
  readonly errors?: readonly string[];
  readonly warnings?: readonly string[];
}

export interface StateDefinition {
  readonly name: string;
  evaluate(input: StateValidationInput): Promise<StateValidationResult> | StateValidationResult;
}

export interface TenantProcessDefinition {
  readonly id: string;
  readonly key: string;
  readonly version: string;
  readonly flows: Record<string, FlowDefinition>;
  readonly stos: Record<string, StateTransitionOperation>;
  readonly stateDefinition: StateDefinition;
}

export interface ExecutionSnapshot {
  readonly run: RunRecord;
  readonly streamState: StreamState;
  readonly tenantProcess: TenantProcessDefinition;
  readonly sto: StateTransitionOperation;
  readonly flow: FlowDefinition;
}
