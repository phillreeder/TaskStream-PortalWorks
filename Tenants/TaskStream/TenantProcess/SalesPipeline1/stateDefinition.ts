import { defineState } from '@TaskStream/App/definitionRuntime/state/defineState.js';

export const connectionAcquisitionTaskStateDefinition = defineState<{
  taskStatus:
    | 'unresolved'
    | 'ready'
    | 'active'
    | 'cycle_complete'
    | 'promotion_ready'
    | 'promoting'
    | 'promoted'
    | 'blocked'
    | 'failed';
  accountRef: string;
  cycleCandidateLimit: number;
  currentCycleNumber: number;
  cycleStatus: 'not_started' | 'active' | 'complete';
  candidatesProcessedThisCycle: number;
  candidatesIdentified: number;
  connectionRequestsSent: number;
  candidatesSkipped: number;
  candidatesFailed: number;
  browserAvailability: 'unknown' | 'available' | 'unavailable';
  linkedinSessionStatus: 'unknown' | 'available' | 'unavailable';
  promotionStatus: 'not_ready' | 'ready' | 'in_progress' | 'complete';
  objectives: readonly {
    objectiveRef: string;
    searchTerm: string;
    streamRef: string;
    status: 'pending' | 'active' | 'exhausted' | 'completed' | 'blocked' | 'failed';
    targetRequestCount: number;
    requestSentCount: number;
  }[];
  candidates: readonly {
    candidateKey: string;
    profileUrl: string;
    displayName: string;
    headline: string;
    matchedObjectiveRefs: readonly string[];
    discoveredByStreamRefs: readonly string[];
    externalStatus: 'unknown' | 'connectable' | 'request_pending' | 'connected' | 'unavailable';
    requestOutcome: 'not_attempted' | 'sent' | 'skipped' | 'failed';
    lastResolvedAt: string;
    attemptedAt: string;
    failureReason: string;
  }[];
  lastError: string;
}>()({
  id: 'connectionAcquisitionTask',
  version: 1,
  strict: true,

  defaults: {
    taskStatus: 'unresolved',
    accountRef: '',
    cycleCandidateLimit: 20,
    currentCycleNumber: 0,
    cycleStatus: 'not_started',
    candidatesProcessedThisCycle: 0,
    candidatesIdentified: 0,
    connectionRequestsSent: 0,
    candidatesSkipped: 0,
    candidatesFailed: 0,
    browserAvailability: 'unknown',
    linkedinSessionStatus: 'unknown',
    promotionStatus: 'not_ready',
    objectives: [],
    candidates: [],
    lastError: '',
  },

  fields: {
    taskStatus: {
      type: 'enum',
      values: [
        'unresolved',
        'ready',
        'active',
        'cycle_complete',
        'promotion_ready',
        'promoting',
        'promoted',
        'blocked',
        'failed',
      ] as const,
    },
    accountRef: { type: 'string' },
    cycleCandidateLimit: {
      type: 'number',
      constraints: [
        {
          kind: 'min_value',
          phase: 'change',
          payload: { value: 1 },
        },
      ],
    },
    currentCycleNumber: {
      type: 'number',
      constraints: [
        {
          kind: 'min_value',
          phase: 'change',
          payload: { value: 0 },
        },
      ],
    },
    cycleStatus: {
      type: 'enum',
      values: ['not_started', 'active', 'complete'] as const,
    },
    candidatesProcessedThisCycle: nonNegativeNumberField(),
    candidatesIdentified: nonNegativeNumberField(),
    connectionRequestsSent: nonNegativeNumberField(),
    candidatesSkipped: nonNegativeNumberField(),
    candidatesFailed: nonNegativeNumberField(),
    browserAvailability: {
      type: 'enum',
      values: ['unknown', 'available', 'unavailable'] as const,
    },
    linkedinSessionStatus: {
      type: 'enum',
      values: ['unknown', 'available', 'unavailable'] as const,
    },
    promotionStatus: {
      type: 'enum',
      values: ['not_ready', 'ready', 'in_progress', 'complete'] as const,
    },
    objectives: {
      type: 'array',
      items: {
        type: 'object_inline',
        fields: {
          objectiveRef: { type: 'string' },
          searchTerm: { type: 'string' },
          streamRef: { type: 'string' },
          status: {
            type: 'enum',
            values: ['pending', 'active', 'exhausted', 'completed', 'blocked', 'failed'] as const,
          },
          targetRequestCount: nonNegativeNumberField(),
          requestSentCount: nonNegativeNumberField(),
        },
      },
    },
    candidates: {
      type: 'array',
      items: {
        type: 'object_inline',
        fields: {
          candidateKey: { type: 'string' },
          profileUrl: { type: 'string' },
          displayName: { type: 'string' },
          headline: { type: 'string' },
          matchedObjectiveRefs: {
            type: 'array',
            items: { type: 'string' },
          },
          discoveredByStreamRefs: {
            type: 'array',
            items: { type: 'string' },
          },
          externalStatus: {
            type: 'enum',
            values: ['unknown', 'connectable', 'request_pending', 'connected', 'unavailable'] as const,
          },
          requestOutcome: {
            type: 'enum',
            values: ['not_attempted', 'sent', 'skipped', 'failed'] as const,
          },
          lastResolvedAt: { type: 'string' },
          attemptedAt: { type: 'string' },
          failureReason: { type: 'string' },
        },
      },
    },
    lastError: { type: 'string' },
  },
});

export const connectionSearchStreamStateDefinition = defineState<{
  objectiveRef: string;
  searchTerm: string;
  phase:
    | 'ready_for_page_inspection'
    | 'page_inspected'
    | 'ready_for_connection_actions'
    | 'page_processed'
    | 'exhausted'
    | 'blocked'
    | 'completed'
    | 'failed';
  currentPageNumber: number;
  currentPageRef: string;
  currentPageCursor: string;
  hasNextPage: boolean;
  candidateKeysOnPage: readonly string[];
  viableCandidateKeysOnPage: readonly string[];
  pagesInspected: number;
  candidatesSeen: number;
  candidatesResolved: number;
  connectionRequestsSent: number;
  candidatesSkipped: number;
  candidatesFailed: number;
  lastError: string;
}>()({
  id: 'connectionSearchStream',
  version: 1,
  strict: true,

  defaults: {
    objectiveRef: '',
    searchTerm: '',
    phase: 'ready_for_page_inspection',
    currentPageNumber: 1,
    currentPageRef: '',
    currentPageCursor: '',
    hasNextPage: true,
    candidateKeysOnPage: [],
    viableCandidateKeysOnPage: [],
    pagesInspected: 0,
    candidatesSeen: 0,
    candidatesResolved: 0,
    connectionRequestsSent: 0,
    candidatesSkipped: 0,
    candidatesFailed: 0,
    lastError: '',
  },

  fields: {
    objectiveRef: { type: 'string' },
    searchTerm: { type: 'string' },
    phase: {
      type: 'enum',
      values: [
        'ready_for_page_inspection',
        'page_inspected',
        'ready_for_connection_actions',
        'page_processed',
        'exhausted',
        'blocked',
        'completed',
        'failed',
      ] as const,
    },
    currentPageNumber: {
      type: 'number',
      constraints: [
        {
          kind: 'min_value',
          phase: 'change',
          payload: { value: 1 },
        },
      ],
    },
    currentPageRef: { type: 'string' },
    currentPageCursor: { type: 'string' },
    hasNextPage: { type: 'boolean' },
    candidateKeysOnPage: {
      type: 'array',
      items: { type: 'string' },
    },
    viableCandidateKeysOnPage: {
      type: 'array',
      items: { type: 'string' },
    },
    pagesInspected: nonNegativeNumberField(),
    candidatesSeen: nonNegativeNumberField(),
    candidatesResolved: nonNegativeNumberField(),
    connectionRequestsSent: nonNegativeNumberField(),
    candidatesSkipped: nonNegativeNumberField(),
    candidatesFailed: nonNegativeNumberField(),
    lastError: { type: 'string' },
  },
});

function nonNegativeNumberField() {
  return {
    type: 'number',
    constraints: [
      {
        kind: 'min_value',
        phase: 'change',
        payload: { value: 0 },
      },
    ],
  } as const;
}
