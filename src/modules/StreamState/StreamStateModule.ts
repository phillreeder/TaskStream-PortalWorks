import { StreamStateModuleError } from './errors.js';
import { InMemoryStateChangeQueue } from './InMemoryStateChangeQueue.js';
import { StateConsolidator } from './StateConsolidator.js';
import { StateReservationRegistry } from './StateReservationRegistry.js';
import type {
  ResolvedStreamState,
  StateReservationContract,
  StateReservationRequest,
  StreamKey,
  StreamStatePlanningContract,
  StreamStateReader,
  StreamStateStore,
  StreamStateWriter,
  VerifiedStateChange,
} from './types.js';

export interface StreamStateModuleOptions {
  readonly clock?: () => string;
}

export class StreamStateModule implements StreamStateReader, StreamStateWriter {
  private readonly stateChangeQueue = new InMemoryStateChangeQueue();
  private readonly consolidator = new StateConsolidator();
  private readonly reservations = new StateReservationRegistry();
  private readonly planningContracts = new Map<string, StreamStatePlanningContract>();
  private readonly clock: () => string;

  constructor(private readonly store: StreamStateStore, options: StreamStateModuleOptions = {}) {
    this.clock = options.clock ?? (() => new Date().toISOString());
  }

  async resolve(streamKey: StreamKey): Promise<ResolvedStreamState> {
    const authoritativeState = await this.store.getAuthoritativeState(streamKey);
    if (!authoritativeState) {
      throw new StreamStateModuleError(`Stream ${streamKey} has no authoritative state`, 'STREAM_STATE_NOT_FOUND');
    }

    return this.consolidator.consolidate({
      authoritativeState,
      pendingChanges: this.stateChangeQueue.peek(streamKey),
      dependencyBlocks: [],
    });
  }

  async createPlanningContract(streamKey: StreamKey): Promise<StreamStatePlanningContract> {
    const resolvedState = await this.resolve(streamKey);
    const createdAt = this.clock();
    const planningContract: StreamStatePlanningContract = {
      planningContractId: `state-planning:${streamKey}:${resolvedState.authoritativeVersion}:${createdAt}`,
      streamKey,
      resolvedState,
      readablePaths: [],
      writablePaths: [],
      expectedChanges: [],
      dependencyBlocks: resolvedState.dependencyBlocks,
      createdAt,
    };

    this.planningContracts.set(planningContract.planningContractId, planningContract);
    return planningContract;
  }

  async reserve(request: StateReservationRequest): Promise<StateReservationContract> {
    const planningContract = this.planningContracts.get(request.planningContractId);
    if (!planningContract) {
      throw new StreamStateModuleError(
        `Planning contract ${request.planningContractId} was not found`,
        'PLANNING_CONTRACT_NOT_FOUND',
      );
    }

    return this.reservations.reserve(request, planningContract);
  }

  async applyVerifiedChanges(input: {
    readonly reservation: StateReservationContract;
    readonly changes: readonly VerifiedStateChange[];
  }): Promise<ResolvedStreamState> {
    const activeReservation = this.reservations.getActive(input.reservation.reservationId);
    for (const change of input.changes) {
      this.stateChangeQueue.enqueue({ ...change, reservationId: activeReservation.reservationId });
    }

    const authoritativeState = await this.store.getAuthoritativeState(activeReservation.streamKey);
    if (!authoritativeState) {
      throw new StreamStateModuleError(
        `Stream ${activeReservation.streamKey} has no authoritative state`,
        'STREAM_STATE_NOT_FOUND',
      );
    }

    const resolved = this.consolidator.consolidate({
      authoritativeState,
      pendingChanges: this.stateChangeQueue.drain(activeReservation.streamKey),
      dependencyBlocks: [],
    });

    await this.store.saveAuthoritativeState({
      streamKey: activeReservation.streamKey,
      version: resolved.effectiveVersion,
      state: resolved.state,
      updatedAt: this.clock(),
    });

    return resolved;
  }

  async releaseReservation(reservationId: string): Promise<void> {
    this.reservations.release(reservationId);
  }
}
