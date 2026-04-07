import type { ExecutionContext } from '../contracts/executionContext.ts';
import type { StateChangeBatch } from '../contracts/stateWriter.ts';

export interface RunRecord {
  readonly id: string;
  readonly streamStateId: string;
  readonly tenantProcessId: string;
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

export interface StateChange {
  readonly key: string;
  readonly value: unknown;
}

export type ValidationPhase = 'pre' | 'post';

export type StatePropertyType = 'string' | 'number' | 'boolean' | 'object' | 'array';

export type StatePropertyTag = 'immutable' | 'irreversible' | 'monotonic';

export interface StatePropertyDefinition {
  readonly type: StatePropertyType;
  readonly description?: string;
  readonly required?: boolean;
  readonly nullable?: boolean;
  readonly enum?: readonly (string | number | boolean)[];
  readonly tags?: readonly StatePropertyTag[];
  /**
   * Paths that must be present when this property is provided. Paths use dot-notation from the root.
   */
  readonly dependsOn?: readonly string[];
  readonly properties?: Record<string, StatePropertyDefinition>;
  readonly items?: StatePropertyDefinition;
  readonly allowAdditionalProperties?: boolean;
}

export interface StateSchema {
  readonly properties: Record<string, StatePropertyDefinition>;
  readonly allowAdditionalProperties?: boolean;
}

export interface StateValidationIssue {
  readonly path: string;
  readonly message: string;
  readonly code: string;
  readonly severity: 'error' | 'warning';
}

export interface StateValidationResult {
  readonly valid: boolean;
  readonly errors?: readonly string[];
  readonly warnings?: readonly string[];
  readonly issues?: readonly StateValidationIssue[];
  readonly changes?: readonly StateChange[];
}

export interface StateInvariantContext {
  readonly state: Record<string, unknown>;
  readonly previousState?: Record<string, unknown>;
  readonly changes?: readonly StateChange[];
  readonly stoKey?: string;
  readonly phase: ValidationPhase;
}

export interface StateInvariantResult {
  readonly valid: boolean;
  readonly message?: string;
  readonly path?: string;
  readonly code?: string;
  readonly severity?: 'error' | 'warning';
}

export interface StateInvariant {
  readonly id: string;
  readonly description?: string;
  readonly phases?: readonly ValidationPhase[];
  readonly validate: (context: StateInvariantContext) => StateInvariantResult;
}

export interface StoApplicabilityRule {
  readonly stoKey: string;
  readonly description?: string;
  readonly errorMessage?: string;
  readonly when: (state: Record<string, unknown>, sto: StateTransitionOperation) => boolean;
}

export interface StateDefinition {
  readonly name: string;
  readonly schema: StateSchema;
  readonly invariants?: readonly StateInvariant[];
  readonly stos?: Record<string, StoApplicabilityRule>;
}

export interface TenantProcessConfig {
  readonly id: string;
  readonly key: string;
  readonly version: string;
  readonly flows?: Record<string, FlowDefinition>;
  readonly stos?: Record<string, StateTransitionOperation>;
  readonly stateDefinition?: StateDefinition;
  readonly validators?: Record<string, unknown>;
  readonly mappers?: Record<string, unknown>;
  readonly selectors?: Record<string, unknown>;
}

export interface TenantProcessRuntime {
  readonly id: string;
  readonly key: string;
  readonly version: string;
  readonly flows: ReadonlyMap<string, FlowDefinition>;
  readonly stos: ReadonlyMap<string, StateTransitionOperation>;
  readonly stateDefinition: StateDefinition;
  readonly validators: Readonly<Record<string, unknown>>;
  readonly mappers: Readonly<Record<string, unknown>>;
  readonly selectors: Readonly<Record<string, unknown>>;
}

export interface ExecutionSnapshot {
  readonly run: RunRecord;
  readonly streamState: StreamState;
  readonly tenantProcess: TenantProcessRuntime;
  readonly sto: StateTransitionOperation;
  readonly flow: FlowDefinition;
}
