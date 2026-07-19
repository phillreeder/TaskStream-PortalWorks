import {
  DEFAULT_FLOW_PERMISSIONS,
  TenantProcess as TenantProcessDef,
} from '@TaskStream/App/domain/tenantProcess/index.js';
import { searchConnectionsChannel } from './channels.js';
import {
  evidenceReviewPausedResultContract,
  linkedInLandingCapturedResultContract,
  openLinkedInLandingInputContract,
} from './contracts.js';
import { openLinkedInLandingFlow, pauseForEvidenceReviewFlow } from './flows.js';
import {
  connectionAcquisitionTaskStateDefinition,
  connectionSearchStreamStateDefinition,
} from './stateDefinition.js';
import { openLinkedInLandingSto, pauseForEvidenceReviewSto } from './stos.js';
import { SearchConnectionsTask } from './task.js';

export const tenantProcess = TenantProcessDef.define({
  id: { tenant: 'TaskStream', process: 'SalesPipeline1' },
  name: 'TaskStream Sales Pipeline — LinkedIn Connections',
  version: 1,
  description: 'Mission-driven LinkedIn connection acquisition with evidence-gated browser steps.',
  flowPermissions: DEFAULT_FLOW_PERMISSIONS,
}, ({ tp }) => {
  const stateDefinitions = tp.stateDefinitions({
    connectionAcquisitionTask: connectionAcquisitionTaskStateDefinition,
    connectionSearchStream: connectionSearchStreamStateDefinition,
  });

  const channels = tp.channels({
    searchConnections: searchConnectionsChannel,
  });

  const inputContracts = tp.inputContracts({
    openLinkedInLanding: openLinkedInLandingInputContract,
  });

  const resultContracts = tp.resultContracts({
    linkedInLandingCaptured: linkedInLandingCapturedResultContract,
    evidenceReviewPaused: evidenceReviewPausedResultContract,
  });

  const stos = tp.stos({
    openLinkedInLanding: {
      ...openLinkedInLandingSto,
      flow: openLinkedInLandingFlow,
      inputContracts: [inputContracts.openLinkedInLanding],
      resultContracts: [resultContracts.linkedInLandingCaptured],
    },
    pauseForEvidenceReview: {
      ...pauseForEvidenceReviewSto,
      flow: pauseForEvidenceReviewFlow,
      resultContracts: [resultContracts.evidenceReviewPaused],
    },
  });

  tp.tasks({
    searchConnections: {
      ...SearchConnectionsTask,
      stateDefinition: stateDefinitions.connectionSearchStream,
      channel: channels.searchConnections,
      stos: {
        openLinkedInLanding: stos.openLinkedInLanding,
        pauseForEvidenceReview: stos.pauseForEvidenceReview,
      },
      defaultSto: stos.openLinkedInLanding,
      inputContracts: [inputContracts.openLinkedInLanding],
    },
  });
});
