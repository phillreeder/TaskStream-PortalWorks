import { activateSearchConnectionsFlow } from './flows.js';

export const SearchConnectionsTask = {
  activationFlow: {
    flowId: 'activateSearchConnections',
    executable: activateSearchConnectionsFlow,
  },
  stateDefinition: 'connectionSearchStream',
  channel: 'searchConnections',
  stos: ['openLinkedInLanding', 'pauseForEvidenceReview'],
  defaultSto: 'openLinkedInLanding',
  inputContracts: ['openLinkedInLanding'],
} as const;
