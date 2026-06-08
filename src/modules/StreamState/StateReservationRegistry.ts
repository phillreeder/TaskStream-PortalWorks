import { StreamStateModuleError } from './errors.js';
import { pathsOverlap } from './path.js';
import type { StateReservationContract, StateReservationRequest, StreamStatePlanningContract } from './types.js';

export class StateReservationRegistry {
  private readonly reservations = new Map<string, StateReservationContract>();

  reserve(request: StateReservationRequest, planningContract: StreamStatePlanningContract): StateReservationContract {
    if (request.planningContractId !== planningContract.planningContractId || request.streamKey !== planningContract.streamKey) {
      throw new StreamStateModuleError('Reservation request does not match planning contract', 'PLANNING_CONTRACT_MISMATCH');
    }

    const conflict = this.findConflict(request);
    if (conflict) {
      throw new StreamStateModuleError(
        `State reservation conflicts with active reservation ${conflict.reservationId}`,
        'RESERVATION_CONFLICT',
      );
    }

    const reservation: StateReservationContract = {
      reservationId: createReservationId(request),
      planningContractId: request.planningContractId,
      streamKey: request.streamKey,
      selectedStoId: request.selectedStoId,
      selectedFlowId: request.selectedFlowId,
      reservedReads: [...request.reads],
      reservedWrites: [...request.writes],
      expectedChanges: [...request.expectedChanges],
      baseStateVersion: planningContract.resolvedState.authoritativeVersion,
      status: 'active',
      createdAt: request.requestedAt,
    };

    this.reservations.set(reservation.reservationId, reservation);
    return reservation;
  }

  getActive(reservationId: string): StateReservationContract {
    const reservation = this.reservations.get(reservationId);
    if (!reservation) {
      throw new StreamStateModuleError(`Reservation ${reservationId} was not found`, 'RESERVATION_NOT_FOUND');
    }
    if (reservation.status !== 'active') {
      throw new StreamStateModuleError(`Reservation ${reservationId} is not active`, 'RESERVATION_INACTIVE');
    }
    return reservation;
  }

  release(reservationId: string): void {
    const reservation = this.getActive(reservationId);
    this.reservations.set(reservationId, { ...reservation, status: 'released' });
  }

  listActive(): readonly StateReservationContract[] {
    return [...this.reservations.values()].filter((reservation) => reservation.status === 'active');
  }

  private findConflict(request: StateReservationRequest): StateReservationContract | null {
    for (const reservation of this.listActive()) {
      if (reservation.streamKey !== request.streamKey) {
        continue;
      }

      const existingWrites = reservation.reservedWrites;
      const requestedWrites = request.writes;
      const requestedReads = request.reads;

      const conflictsWithWrite = requestedWrites.some((requestedPath) =>
        existingWrites.some((existingPath) => pathsOverlap(requestedPath, existingPath)),
      );
      const writeConflictsWithRead = requestedWrites.some((requestedPath) =>
        reservation.reservedReads.some((existingPath) => pathsOverlap(requestedPath, existingPath)),
      );
      const readConflictsWithWrite = requestedReads.some((requestedPath) =>
        existingWrites.some((existingPath) => pathsOverlap(requestedPath, existingPath)),
      );

      if (conflictsWithWrite || writeConflictsWithRead || readConflictsWithWrite) {
        return reservation;
      }
    }
    return null;
  }
}

function createReservationId(request: StateReservationRequest): string {
  return `state-reservation:${request.streamKey}:${request.selectedStoId}:${request.selectedFlowId}:${request.requestedAt}`;
}
