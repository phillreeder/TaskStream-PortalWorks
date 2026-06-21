import { reviewSubmissionChannelDefinition } from './channelDefinition.js';
import { RUNTIME_SPINE_TENANT_PROCESS_IDS } from './ids.js';
import { reviewSubmissionStateDefinition } from './stateDefinition.js';
import {
  autoDecisionSto,
  flagReviewSto,
  generateReviewArtifactSto,
  previewScoreSto,
  startReviewSto,
  summarizeReviewSto,
} from './stos.js';

export const reviewSubmissionTask = {
  id: RUNTIME_SPINE_TENANT_PROCESS_IDS.task,
  stateDefinition: reviewSubmissionStateDefinition,
  channel: reviewSubmissionChannelDefinition,
  stos: [
    startReviewSto,
    previewScoreSto,
    flagReviewSto,
    autoDecisionSto,
    summarizeReviewSto,
    generateReviewArtifactSto,
  ],
  defaultSto: startReviewSto,
};
