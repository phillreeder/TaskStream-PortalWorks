import {
  autoDecisionFlow,
  flagReviewFlow,
  generateReviewArtifactFlow,
  previewScoreFlow,
  startReviewFlow,
  summarizeReviewFlow,
} from './flows.js';
import { RUNTIME_SPINE_TENANT_PROCESS_IDS } from './ids.js';

export const startReviewFlowDefinition = {
  id: RUNTIME_SPINE_TENANT_PROCESS_IDS.flows.startReview,
  executable: startReviewFlow,
};

export const previewScoreFlowDefinition = {
  id: RUNTIME_SPINE_TENANT_PROCESS_IDS.flows.previewScore,
  executable: previewScoreFlow,
};

export const flagReviewFlowDefinition = {
  id: RUNTIME_SPINE_TENANT_PROCESS_IDS.flows.flagReview,
  executable: flagReviewFlow,
};

export const autoDecisionFlowDefinition = {
  id: RUNTIME_SPINE_TENANT_PROCESS_IDS.flows.autoDecision,
  executable: autoDecisionFlow,
};

export const summarizeReviewFlowDefinition = {
  id: RUNTIME_SPINE_TENANT_PROCESS_IDS.flows.summarizeReview,
  executable: summarizeReviewFlow,
};

export const generateReviewArtifactFlowDefinition = {
  id: RUNTIME_SPINE_TENANT_PROCESS_IDS.flows.generateReviewArtifact,
  executable: generateReviewArtifactFlow,
};
