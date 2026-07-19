import type {
  CandidateRecord,
  SalesMissionProcessState,
} from './mission-model.js';

export type MissionPlannerDecision =
  | {
      readonly kind: 'activate-task';
      readonly taskRef: 'searchConnections';
      readonly mode: 'search';
      readonly reason: string;
    }
  | {
      readonly kind: 'activate-task';
      readonly taskRef: 'connectionAcquisition';
      readonly mode: 'request' | 'reconcile';
      readonly candidateKeys: readonly string[];
      readonly reason: string;
    }
  | {
      readonly kind: 'activate-task';
      readonly taskRef: 'sendFirstMessages';
      readonly mode: 'send';
      readonly candidateKeys: readonly string[];
      readonly reason: string;
    }
  | {
      readonly kind: 'wait';
      readonly until: string;
      readonly reason: string;
    }
  | {
      readonly kind: 'complete';
      readonly outcome: 'target_reached' | 'exhausted';
      readonly reason: string;
    }
  | {
      readonly kind: 'blocked';
      readonly reason: string;
    };

export interface MissionPlanningSnapshot {
  readonly processState: SalesMissionProcessState;
  readonly candidates: readonly CandidateRecord[];
  readonly now: string;
}

/**
 * Scratch ProcessChannel policy.
 *
 * It deliberately prefers time-sensitive downstream work over discovering
 * more candidates. The function only selects work. It performs no storage or
 * browser actions.
 */
export function selectNextMissionWork(snapshot: MissionPlanningSnapshot): MissionPlannerDecision {
  const { processState, candidates } = snapshot;

  if (processState.status === 'blocked' || processState.status === 'failed') {
    return {
      kind: 'blocked',
      reason: processState.lastError || `Process is ${processState.status}`,
    };
  }

  if (processState.counters.firstMessagesSent >= processState.params.targetFirstMessages) {
    return {
      kind: 'complete',
      outcome: 'target_reached',
      reason: 'The project target for sent first messages has been reached.',
    };
  }

  const messageLimit = processState.params.firstMessages.cycleCandidateLimit;
  const readyForMessage = candidates
    .filter((candidate) => candidate.connectionStatus === 'connected')
    .filter((candidate) => candidate.firstMessageStatus === 'ready')
    .slice(0, messageLimit);

  if (readyForMessage.length > 0) {
    return {
      kind: 'activate-task',
      taskRef: 'sendFirstMessages',
      mode: 'send',
      candidateKeys: readyForMessage.map((candidate) => candidate.candidateKey),
      reason: 'Connected candidates are ready for their first message.',
    };
  }

  const connectionLimit = processState.params.connections.cycleCandidateLimit;
  const dueForReconciliation = candidates
    .filter((candidate) => candidate.connectionStatus === 'request_pending')
    .filter((candidate) => isConnectionCheckDue(candidate, processState, snapshot.now))
    .slice(0, connectionLimit);

  if (dueForReconciliation.length > 0) {
    return {
      kind: 'activate-task',
      taskRef: 'connectionAcquisition',
      mode: 'reconcile',
      candidateKeys: dueForReconciliation.map((candidate) => candidate.candidateKey),
      reason: 'Pending connection requests are due for status reconciliation.',
    };
  }

  const availableRequestCapacity = Math.max(
    0,
    processState.params.connections.maximumRequests
      - processState.counters.connectionRequestsSent,
  );
  const requestBatchSize = Math.min(connectionLimit, availableRequestCapacity);
  const readyForRequest = candidates
    .filter((candidate) => candidate.eligibilityStatus === 'eligible')
    .filter((candidate) => candidate.connectionStatus === 'not_requested')
    .slice(0, requestBatchSize);

  if (readyForRequest.length > 0) {
    return {
      kind: 'activate-task',
      taskRef: 'connectionAcquisition',
      mode: 'request',
      candidateKeys: readyForRequest.map((candidate) => candidate.candidateKey),
      reason: 'Eligible candidates are available for connection requests.',
    };
  }

  const objectivesRemain = processState.params.search.objectives.some((objective) =>
    objective.status === 'pending' || objective.status === 'active',
  );
  const candidateCapacityRemains =
    processState.counters.candidatesDiscovered < processState.params.maximumCandidates;

  if (objectivesRemain && candidateCapacityRemains) {
    return {
      kind: 'activate-task',
      taskRef: 'searchConnections',
      mode: 'search',
      reason: 'More candidates are required and searchable objectives remain.',
    };
  }

  const pending = candidates.filter((candidate) => candidate.connectionStatus === 'request_pending');
  if (pending.length > 0) {
    return {
      kind: 'wait',
      until: earliestNextConnectionCheck(pending, processState, snapshot.now),
      reason: 'Only non-due pending connection requests remain actionable.',
    };
  }

  return {
    kind: 'complete',
    outcome: 'exhausted',
    reason: 'Search objectives and all currently actionable candidate work are exhausted.',
  };
}

function isConnectionCheckDue(
  candidate: CandidateRecord,
  processState: SalesMissionProcessState,
  now: string,
): boolean {
  if (!candidate.connectionRequestSentAt) return true;
  if (candidate.connectionStatusChecks >= processState.params.connections.maximumStatusChecks) {
    return false;
  }

  const sentAt = Date.parse(candidate.connectionRequestSentAt);
  const current = Date.parse(now);
  if (!Number.isFinite(sentAt) || !Number.isFinite(current)) return true;

  const dueAfterMs = processState.params.connections.minimumHoursBeforeRecheck * 60 * 60 * 1000;
  return current >= sentAt + dueAfterMs;
}

function earliestNextConnectionCheck(
  candidates: readonly CandidateRecord[],
  processState: SalesMissionProcessState,
  fallback: string,
): string {
  const delayMs = processState.params.connections.minimumHoursBeforeRecheck * 60 * 60 * 1000;
  const nextChecks = candidates
    .map((candidate) => Date.parse(candidate.connectionRequestSentAt))
    .filter(Number.isFinite)
    .map((sentAt) => sentAt + delayMs)
    .sort((left, right) => left - right);

  return nextChecks.length > 0 ? new Date(nextChecks[0]).toISOString() : fallback;
}
