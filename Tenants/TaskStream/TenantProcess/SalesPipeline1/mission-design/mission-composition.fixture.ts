import type { FlowAuthority } from '@TaskStream/App/domain/tenantProcess/index.js';
import type {
  CandidateRecord,
  ConnectionAcquisitionTaskState,
  FirstMessageRecord,
  SalesMissionProcessState,
  SearchConnectionsTaskState,
  SendFirstMessagesTaskState,
} from './mission-model.js';

export interface MissionStoFixture {
  readonly authority: FlowAuthority;
  readonly taskRef: 'process' | 'searchConnections' | 'connectionAcquisition' | 'sendFirstMessages';
  readonly purpose: string;
}

/**
 * Catalogue intended to map directly into future tp.stos({...}) declarations.
 * Executable Flow bodies are deliberately absent from this scratch fixture.
 */
export const missionStoFixture = {
  initializeMission: {
    authority: 'process',
    taskRef: 'process',
    purpose: 'Validate project parameters and make the mission routable.',
  },

  openSearchCycle: {
    authority: 'edge',
    taskRef: 'searchConnections',
    purpose: 'Select objective membership and create one search Stream per objective.',
  },
  inspectSearchPage: {
    authority: 'task',
    taskRef: 'searchConnections',
    purpose: 'Interpret an externally supplied search-page observation.',
  },
  recordSearchPage: {
    authority: 'edge',
    taskRef: 'searchConnections',
    purpose: 'Add page discoveries to Search TaskState and advance or close the Stream.',
  },
  promoteSearchResults: {
    authority: 'process',
    taskRef: 'process',
    purpose: 'Dedupe and promote Search TaskState discoveries into ProcessState candidates.',
  },

  openConnectionCycle: {
    authority: 'edge',
    taskRef: 'connectionAcquisition',
    purpose: 'Freeze a request or reconciliation candidate batch and create candidate Streams.',
  },
  inspectConnectionCandidate: {
    authority: 'task',
    taskRef: 'connectionAcquisition',
    purpose: 'Interpret the externally supplied candidate profile or connection status.',
  },
  executeConnectionAction: {
    authority: 'task',
    taskRef: 'connectionAcquisition',
    purpose: 'Interpret the externally supplied connection-action receipt.',
  },
  recordConnectionOutcome: {
    authority: 'edge',
    taskRef: 'connectionAcquisition',
    purpose: 'Add a connection attempt to TaskState and close the candidate Stream.',
  },
  promoteConnectionResults: {
    authority: 'process',
    taskRef: 'process',
    purpose: 'Promote attempt records and candidate connection status into ProcessState.',
  },

  openFirstMessageCycle: {
    authority: 'edge',
    taskRef: 'sendFirstMessages',
    purpose: 'Freeze connected candidate membership and create candidate Streams.',
  },
  prepareFirstMessage: {
    authority: 'task',
    taskRef: 'sendFirstMessages',
    purpose: 'Render the project-selected first-message template for one candidate.',
  },
  executeFirstMessageSend: {
    authority: 'task',
    taskRef: 'sendFirstMessages',
    purpose: 'Interpret the externally supplied message-send receipt.',
  },
  recordFirstMessageOutcome: {
    authority: 'edge',
    taskRef: 'sendFirstMessages',
    purpose: 'Add the prepared/sent message to TaskState and close the candidate Stream.',
  },
  promoteFirstMessageResults: {
    authority: 'process',
    taskRef: 'process',
    purpose: 'Promote messages and candidate message status into ProcessState.',
  },

  completeMission: {
    authority: 'process',
    taskRef: 'process',
    purpose: 'Complete the mission when its target or exhaustion condition is reached.',
  },
} as const satisfies Readonly<Record<string, MissionStoFixture>>;

export const missionTaskFixture = {
  searchConnections: {
    channelRef: 'searchConnections',
    stoRefs: ['openSearchCycle', 'inspectSearchPage', 'recordSearchPage'] as const,
    promoterStoRef: 'promoteSearchResults',
  },
  connectionAcquisition: {
    channelRef: 'connectionAcquisition',
    stoRefs: [
      'openConnectionCycle',
      'inspectConnectionCandidate',
      'executeConnectionAction',
      'recordConnectionOutcome',
    ] as const,
    promoterStoRef: 'promoteConnectionResults',
  },
  sendFirstMessages: {
    channelRef: 'sendFirstMessages',
    stoRefs: [
      'openFirstMessageCycle',
      'prepareFirstMessage',
      'executeFirstMessageSend',
      'recordFirstMessageOutcome',
    ] as const,
    promoterStoRef: 'promoteFirstMessageResults',
  },
} as const;

const fixtureTime = '2026-07-18T12:00:00.000Z';

export const missionProcessStateFixture: SalesMissionProcessState = {
  schemaVersion: 1,
  processRef: 'sales-mission-001',
  status: 'ready',
  params: {
    projectRef: 'syncro-taskstream-outreach',
    clientRef: 'syncro-ltd',
    systemPolicyRef: 'taskstream-system-defaults',
    accountRef: 'linkedin-primary',
    platform: 'linkedin',
    targetFirstMessages: 2,
    maximumCandidates: 20,
    search: {
      objectives: [
        {
          objectiveRef: 'fractional-cto-uk',
          searchTerm: 'fractional CTO United Kingdom',
          priority: 1,
          targetCandidateCount: 10,
          maxPages: 3,
          location: 'United Kingdom',
          industry: 'software',
          status: 'pending',
          pagesInspected: 0,
          candidatesDiscovered: 0,
        },
      ],
      cycleObjectiveLimit: 1,
      excludedProfileKeys: [],
      excludedCompanyNames: [],
    },
    connections: {
      cycleCandidateLimit: 5,
      maximumRequests: 10,
      minimumHoursBeforeRecheck: 24,
      maximumStatusChecks: 7,
      requestNoteTemplateRef: '',
    },
    firstMessages: {
      cycleCandidateLimit: 5,
      maximumMessages: 10,
      templateRef: 'MSG-FCTO-001/01-initial',
      variantRef: 'MSG-FCTO-001',
      minimumMinutesAfterConnection: 0,
    },
  },
  taskProgress: {
    searchConnections: emptyTaskProgress('ready'),
    connectionAcquisition: emptyTaskProgress('not_started'),
    sendFirstMessages: emptyTaskProgress('not_started'),
  },
  collections: {
    candidates: collection('candidates'),
    connectionAttempts: collection('connectionAttempts'),
    firstMessages: collection('firstMessages'),
  },
  counters: {
    candidatesDiscovered: 0,
    candidatesEligible: 0,
    connectionRequestsSent: 0,
    connectionsAccepted: 0,
    firstMessagesSent: 0,
    candidatesExcluded: 0,
    failedActions: 0,
  },
  createdAt: fixtureTime,
  updatedAt: fixtureTime,
  lastError: '',
};

export const searchTaskStateFixture: SearchConnectionsTaskState = {
  taskRef: 'searchConnections',
  status: 'ready',
  currentCycleRef: '',
  cycleNumber: 0,
  cycleStatus: 'not_started',
  objectiveRefsInCycle: [],
  pendingCandidateKeys: [],
  streamsOpened: 0,
  streamsCompleted: 0,
  lastError: '',
};

export const connectionTaskStateFixture: ConnectionAcquisitionTaskState = {
  taskRef: 'connectionAcquisition',
  status: 'not_started',
  currentCycleRef: '',
  cycleNumber: 0,
  cycleMode: 'request',
  cycleStatus: 'not_started',
  candidateKeysInCycle: [],
  pendingAttemptRefs: [],
  streamsOpened: 0,
  streamsCompleted: 0,
  lastError: '',
};

export const messageTaskStateFixture: SendFirstMessagesTaskState = {
  taskRef: 'sendFirstMessages',
  status: 'not_started',
  currentCycleRef: '',
  cycleNumber: 0,
  cycleStatus: 'not_started',
  candidateKeysInCycle: [],
  pendingMessageRefs: [],
  streamsOpened: 0,
  streamsCompleted: 0,
  lastError: '',
};

/**
 * A deterministic no-browser fixture proving the intended mission handoff:
 * discovery -> request -> accepted connection -> first message.
 */
export const missionExternalFixture = {
  searchPageObservation: {
    objectiveRef: 'fractional-cto-uk',
    pageNumber: 1,
    hasNextPage: false,
    evidenceRef: 'fixture:search-page:1',
    candidates: [
      candidateFixture('linkedin:alice-example', 'Alice Example', 'Fractional CTO'),
      candidateFixture('linkedin:bob-example', 'Bob Example', 'Technology Advisor'),
    ],
  },
  connectionRequestReceipts: [
    {
      candidateKey: 'linkedin:alice-example',
      outcome: 'sent',
      externalReceiptRef: 'fixture:connection-request:alice',
    },
    {
      candidateKey: 'linkedin:bob-example',
      outcome: 'sent',
      externalReceiptRef: 'fixture:connection-request:bob',
    },
  ],
  connectionStatusObservations: [
    {
      candidateKey: 'linkedin:alice-example',
      status: 'connected',
      externalReceiptRef: 'fixture:connection-status:alice',
    },
    {
      candidateKey: 'linkedin:bob-example',
      status: 'request_pending',
      externalReceiptRef: 'fixture:connection-status:bob',
    },
  ],
  messageSendReceipt: {
    candidateKey: 'linkedin:alice-example',
    messageRef: 'first-message:alice',
    outcome: 'sent',
    externalReceiptRef: 'fixture:first-message:alice',
  },
} as const;

export const firstMessageFixture: FirstMessageRecord = {
  messageRef: 'first-message:alice',
  candidateKey: 'linkedin:alice-example',
  templateRef: 'MSG-FCTO-001/01-initial',
  variantRef: 'MSG-FCTO-001',
  renderedText: 'Hi Alice - I noticed your Fractional CTO work and wanted to connect.',
  personalization: {
    firstName: 'Alice',
    headline: 'Fractional CTO',
  },
  status: 'prepared',
  externalReceiptRef: '',
  preparedAt: fixtureTime,
  sentAt: '',
  failureReason: '',
};

function emptyTaskProgress(status: 'ready' | 'not_started') {
  return {
    status,
    cyclesStarted: 0,
    cyclesCompleted: 0,
    lastCycleRef: '',
    lastError: '',
  } as const;
}

function collection(name: 'candidates' | 'connectionAttempts' | 'firstMessages') {
  return {
    collection: name,
    storageRef: `process/records/${name}`,
    recordCount: 0,
    revision: 0,
  } as const;
}

function candidateFixture(
  candidateKey: string,
  displayName: string,
  headline: string,
): CandidateRecord {
  return {
    candidateKey,
    platformProfileKey: candidateKey.replace('linkedin:', ''),
    profileUrl: `https://www.linkedin.com/in/${candidateKey.replace('linkedin:', '')}`,
    displayName,
    headline,
    companyName: '',
    location: 'United Kingdom',
    matchedObjectiveRefs: ['fractional-cto-uk'],
    discoveryEvidenceRefs: ['fixture:search-page:1'],
    eligibilityStatus: 'eligible',
    exclusionReason: '',
    connectionStatus: 'not_requested',
    connectionRequestSentAt: '',
    connectedAt: '',
    connectionStatusChecks: 0,
    lastConnectionAttemptRef: '',
    firstMessageStatus: 'not_ready',
    firstMessageRef: '',
    firstMessageSentAt: '',
    discoveredAt: fixtureTime,
    updatedAt: fixtureTime,
    lastError: '',
  };
}
