/**
 * Scratch model for the complete SalesPipeline1 mission.
 *
 * This is intentionally not wired into the current TenantProcess. It defines
 * the state ownership boundaries that a temporary RuntimeScaffold sidecar can
 * use until ProcessState and TaskState are first-class runtime stores.
 */

export type MissionTaskRef =
  | 'searchConnections'
  | 'connectionAcquisition'
  | 'sendFirstMessages';

export type MissionTaskStatus =
  | 'not_started'
  | 'ready'
  | 'active'
  | 'waiting'
  | 'complete'
  | 'blocked'
  | 'failed';

export interface MissionTaskProgress {
  readonly status: MissionTaskStatus;
  readonly cyclesStarted: number;
  readonly cyclesCompleted: number;
  readonly lastCycleRef: string;
  readonly lastError: string;
}

export interface ProcessCollectionState {
  /** Logical collection name owned by ProcessState. */
  readonly collection: 'candidates' | 'connectionAttempts' | 'firstMessages';
  /** Temporary physical store location. This is not semantic authority. */
  readonly storageRef: string;
  readonly recordCount: number;
  readonly revision: number;
}

export interface SearchObjective {
  readonly objectiveRef: string;
  readonly searchTerm: string;
  readonly priority: number;
  readonly targetCandidateCount: number;
  readonly maxPages: number;
  readonly location: string;
  readonly industry: string;
  readonly status: 'pending' | 'active' | 'exhausted' | 'complete' | 'blocked' | 'failed';
  readonly pagesInspected: number;
  readonly candidatesDiscovered: number;
}

export interface SalesMissionProjectParams {
  readonly projectRef: string;
  readonly clientRef: string;
  readonly systemPolicyRef: string;
  readonly accountRef: string;
  readonly platform: 'linkedin';

  readonly targetFirstMessages: number;
  readonly maximumCandidates: number;

  readonly search: {
    readonly objectives: readonly SearchObjective[];
    readonly cycleObjectiveLimit: number;
    readonly excludedProfileKeys: readonly string[];
    readonly excludedCompanyNames: readonly string[];
  };

  readonly connections: {
    readonly cycleCandidateLimit: number;
    readonly maximumRequests: number;
    readonly minimumHoursBeforeRecheck: number;
    readonly maximumStatusChecks: number;
    readonly requestNoteTemplateRef: string;
  };

  readonly firstMessages: {
    readonly cycleCandidateLimit: number;
    readonly maximumMessages: number;
    readonly templateRef: string;
    readonly variantRef: string;
    readonly minimumMinutesAfterConnection: number;
  };
}

/**
 * ProcessState is the project-level authority below ClientParams and
 * SystemParams. It owns project parameters and all records that must survive
 * or move across Task boundaries.
 */
export interface SalesMissionProcessState {
  readonly schemaVersion: 1;
  readonly processRef: string;
  readonly status: 'draft' | 'ready' | 'active' | 'waiting' | 'complete' | 'blocked' | 'failed';
  readonly params: SalesMissionProjectParams;

  readonly taskProgress: Readonly<Record<MissionTaskRef, MissionTaskProgress>>;

  readonly collections: {
    readonly candidates: ProcessCollectionState;
    readonly connectionAttempts: ProcessCollectionState;
    readonly firstMessages: ProcessCollectionState;
  };

  readonly counters: {
    readonly candidatesDiscovered: number;
    readonly candidatesEligible: number;
    readonly connectionRequestsSent: number;
    readonly connectionsAccepted: number;
    readonly firstMessagesSent: number;
    readonly candidatesExcluded: number;
    readonly failedActions: number;
  };

  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastError: string;
}

export interface CandidateRecord {
  readonly candidateKey: string;
  readonly platformProfileKey: string;
  readonly profileUrl: string;
  readonly displayName: string;
  readonly headline: string;
  readonly companyName: string;
  readonly location: string;

  readonly matchedObjectiveRefs: readonly string[];
  readonly discoveryEvidenceRefs: readonly string[];

  readonly eligibilityStatus: 'unreviewed' | 'eligible' | 'excluded' | 'failed';
  readonly exclusionReason: string;

  readonly connectionStatus:
    | 'not_requested'
    | 'request_pending'
    | 'connected'
    | 'declined'
    | 'withdrawn'
    | 'unavailable'
    | 'failed';
  readonly connectionRequestSentAt: string;
  readonly connectedAt: string;
  readonly connectionStatusChecks: number;
  readonly lastConnectionAttemptRef: string;

  readonly firstMessageStatus: 'not_ready' | 'ready' | 'sent' | 'suppressed' | 'failed';
  readonly firstMessageRef: string;
  readonly firstMessageSentAt: string;

  readonly discoveredAt: string;
  readonly updatedAt: string;
  readonly lastError: string;
}

export interface ConnectionAttemptRecord {
  readonly attemptRef: string;
  readonly candidateKey: string;
  readonly kind: 'request' | 'status_check';
  readonly outcome:
    | 'sent'
    | 'already_pending'
    | 'connected'
    | 'still_pending'
    | 'declined'
    | 'unavailable'
    | 'skipped'
    | 'failed';
  readonly externalReceiptRef: string;
  readonly attemptedAt: string;
  readonly nextCheckAt: string;
  readonly failureReason: string;
}

export interface FirstMessageRecord {
  readonly messageRef: string;
  readonly candidateKey: string;
  readonly templateRef: string;
  readonly variantRef: string;
  readonly renderedText: string;
  readonly personalization: Readonly<Record<string, string>>;
  readonly status: 'prepared' | 'sent' | 'suppressed' | 'failed';
  readonly externalReceiptRef: string;
  readonly preparedAt: string;
  readonly sentAt: string;
  readonly failureReason: string;
}

export interface SearchConnectionsTaskState {
  readonly taskRef: 'searchConnections';
  readonly status: MissionTaskStatus;
  readonly currentCycleRef: string;
  readonly cycleNumber: number;
  readonly cycleStatus: 'not_started' | 'active' | 'complete';
  /** Immutable membership after the cycle opens. */
  readonly objectiveRefsInCycle: readonly string[];
  /** Task-owned discoveries waiting for Process-authority promotion. */
  readonly pendingCandidateKeys: readonly string[];
  readonly streamsOpened: number;
  readonly streamsCompleted: number;
  readonly lastError: string;
}

export interface ConnectionAcquisitionTaskState {
  readonly taskRef: 'connectionAcquisition';
  readonly status: MissionTaskStatus;
  readonly currentCycleRef: string;
  readonly cycleNumber: number;
  readonly cycleMode: 'request' | 'reconcile';
  readonly cycleStatus: 'not_started' | 'active' | 'complete';
  /** Immutable membership after the cycle opens. */
  readonly candidateKeysInCycle: readonly string[];
  /** Task-owned attempt records waiting for Process-authority promotion. */
  readonly pendingAttemptRefs: readonly string[];
  readonly streamsOpened: number;
  readonly streamsCompleted: number;
  readonly lastError: string;
}

export interface SendFirstMessagesTaskState {
  readonly taskRef: 'sendFirstMessages';
  readonly status: MissionTaskStatus;
  readonly currentCycleRef: string;
  readonly cycleNumber: number;
  readonly cycleStatus: 'not_started' | 'active' | 'complete';
  /** Immutable membership after the cycle opens. */
  readonly candidateKeysInCycle: readonly string[];
  /** Task-owned messages waiting for Process-authority promotion. */
  readonly pendingMessageRefs: readonly string[];
  readonly streamsOpened: number;
  readonly streamsCompleted: number;
  readonly lastError: string;
}

export type MissionTaskState =
  | SearchConnectionsTaskState
  | ConnectionAcquisitionTaskState
  | SendFirstMessagesTaskState;

export interface SearchStreamState {
  readonly streamKind: 'search';
  readonly streamRef: string;
  readonly cycleRef: string;
  readonly objectiveRef: string;
  readonly phase:
    | 'ready_for_page_observation'
    | 'page_observed'
    | 'page_recorded'
    | 'ready_for_next_page'
    | 'complete'
    | 'blocked'
    | 'failed';
  readonly currentPageNumber: number;
  readonly currentPageCursor: string;
  readonly hasNextPage: boolean;
  readonly candidateKeysOnPage: readonly string[];
  readonly pageEvidenceRef: string;
  readonly lastError: string;
}

export interface ConnectionStreamState {
  readonly streamKind: 'connection';
  readonly streamRef: string;
  readonly cycleRef: string;
  readonly candidateKey: string;
  readonly mode: 'request' | 'reconcile';
  readonly phase:
    | 'ready_for_profile_observation'
    | 'profile_observed'
    | 'ready_for_connection_action'
    | 'action_recorded'
    | 'complete'
    | 'blocked'
    | 'failed';
  readonly externalConnectionStatus:
    | 'unknown'
    | 'connectable'
    | 'request_pending'
    | 'connected'
    | 'declined'
    | 'unavailable';
  readonly attemptRef: string;
  readonly lastError: string;
}

export interface FirstMessageStreamState {
  readonly streamKind: 'first_message';
  readonly streamRef: string;
  readonly cycleRef: string;
  readonly candidateKey: string;
  readonly phase:
    | 'ready_for_profile_observation'
    | 'profile_observed'
    | 'message_prepared'
    | 'ready_for_send'
    | 'send_recorded'
    | 'complete'
    | 'blocked'
    | 'failed';
  readonly messageRef: string;
  readonly renderedText: string;
  readonly lastError: string;
}

export type MissionStreamState =
  | SearchStreamState
  | ConnectionStreamState
  | FirstMessageStreamState;
