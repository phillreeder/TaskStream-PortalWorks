export type JsonPrimitive = string | number | boolean | null;
export type JsonObject = { readonly [key: string]: JsonValue };
export type JsonArray = readonly JsonValue[];
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;

export type StreamKey = string;
export type StateVersion = number;
export type StatePathSegment = string | number;
export type StatePath = readonly StatePathSegment[];

export type StateChangeOperation = 'set' | 'unset' | 'append' | 'merge' | 'increment';
export type StateReservationStatus = 'active' | 'released' | 'expired';
export type StateIntention =
  | 'read-only'
  | 'mutate'
  | 'external-push-initiation'
  | 'external-push-resolution'
  | 'verification'
  | 'projection';

export interface AuthoritativeStreamState {
  readonly streamKey: StreamKey;
  readonly version: StateVersion;
  readonly state: JsonObject;
  readonly updatedAt?: string;
}

export interface VerifiedStateChange {
  readonly changeId: string;
  readonly streamKey: StreamKey;
  readonly path: StatePath;
  readonly operation: StateChangeOperation;
  readonly value?: JsonValue;
  readonly order: number;
  readonly sourceRunId?: string;
  readonly sourceFlowId?: string;
  readonly reservationId?: string;
  readonly verifiedAt?: string;
}

export interface ExpectedStateChange {
  readonly expectationId: string;
  readonly path: StatePath;
  readonly operation: StateChangeOperation;
  readonly value?: JsonValue;
  readonly timing: 'during-flow' | 'after-flow-commit' | 'external-push' | 'manual-resolution';
  readonly externalCorrelationId?: string;
  readonly initiatorRunId?: string;
}

export interface StateDependencyBlock {
  readonly blockId: string;
  readonly streamKey: StreamKey;
  readonly path: StatePath;
  readonly reason:
    | 'external-push-pending'
    | 'initiator-flow-not-finished'
    | 'verified-change-not-applied'
    | 'state-lane-owned-by-active-run'
    | 'reservation-conflict';
  readonly expectationId?: string;
  readonly reservationId?: string;
}

export interface ResolvedStreamState {
  readonly streamKey: StreamKey;
  readonly authoritativeVersion: StateVersion;
  readonly effectiveVersion: StateVersion;
  readonly state: JsonObject;
  readonly appliedPendingChangeIds: readonly string[];
  readonly blockedChangeIds: readonly string[];
  readonly dependencyBlocks: readonly StateDependencyBlock[];
}

export interface StreamStatePlanningContract {
  readonly planningContractId: string;
  readonly streamKey: StreamKey;
  readonly resolvedState: ResolvedStreamState;
  readonly readablePaths: readonly StatePath[];
  readonly writablePaths: readonly StatePath[];
  readonly expectedChanges: readonly ExpectedStateChange[];
  readonly dependencyBlocks: readonly StateDependencyBlock[];
  readonly createdAt: string;
}

export interface StateReservationRequest {
  readonly planningContractId: string;
  readonly streamKey: StreamKey;
  readonly selectedStoId: string;
  readonly selectedFlowId: string;
  readonly reads: readonly StatePath[];
  readonly writes: readonly StatePath[];
  readonly expectedChanges: readonly ExpectedStateChange[];
  readonly intention: StateIntention;
  readonly requestedAt: string;
}

export interface StateReservationContract {
  readonly reservationId: string;
  readonly planningContractId: string;
  readonly streamKey: StreamKey;
  readonly selectedStoId: string;
  readonly selectedFlowId: string;
  readonly reservedReads: readonly StatePath[];
  readonly reservedWrites: readonly StatePath[];
  readonly expectedChanges: readonly ExpectedStateChange[];
  readonly baseStateVersion: StateVersion;
  readonly status: StateReservationStatus;
  readonly createdAt: string;
  readonly expiresAt?: string;
}

export interface StateConsolidationInput {
  readonly authoritativeState: AuthoritativeStreamState;
  readonly pendingChanges: readonly VerifiedStateChange[];
  readonly dependencyBlocks?: readonly StateDependencyBlock[];
}

export interface StateChangeQueue {
  enqueue(change: VerifiedStateChange): void;
  drain(streamKey: StreamKey): readonly VerifiedStateChange[];
  peek(streamKey: StreamKey): readonly VerifiedStateChange[];
}

export interface StreamStateStore {
  getAuthoritativeState(streamKey: StreamKey): Promise<AuthoritativeStreamState | null>;
  saveAuthoritativeState(state: AuthoritativeStreamState): Promise<void>;
}

export interface StreamStateReader {
  resolve(streamKey: StreamKey): Promise<ResolvedStreamState>;
  createPlanningContract(streamKey: StreamKey): Promise<StreamStatePlanningContract>;
}

export interface StreamStateWriter {
  reserve(request: StateReservationRequest): Promise<StateReservationContract>;
  applyVerifiedChanges(input: {
    readonly reservation: StateReservationContract;
    readonly changes: readonly VerifiedStateChange[];
  }): Promise<ResolvedStreamState>;
  releaseReservation(reservationId: string): Promise<void>;
}
