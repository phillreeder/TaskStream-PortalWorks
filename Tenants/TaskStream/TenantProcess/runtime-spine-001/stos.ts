import {
  artifactGeneratedResultContract,
  autoDecisionResultContract,
  flagReviewInputContract,
  previewScoreInputContract,
  reviewFlaggedResultContract,
  reviewStartedResultContract,
  reviewSummaryArtifactContract,
  scorePreviewResultContract,
  startReviewInputContract,
  summaryResultContract,
} from './contracts.js';
import {
  autoDecisionFlowDefinition,
  flagReviewFlowDefinition,
  generateReviewArtifactFlowDefinition,
  previewScoreFlowDefinition,
  startReviewFlowDefinition,
  summarizeReviewFlowDefinition,
} from './flowDefinitions.js';
import { RUNTIME_SPINE_TENANT_PROCESS_IDS } from './ids.js';

export const startReviewSto = {
  id: RUNTIME_SPINE_TENANT_PROCESS_IDS.stos.startReview,
  flow: startReviewFlowDefinition,
  inputContracts: [startReviewInputContract],
  resultContracts: [reviewStartedResultContract],
};

export const previewScoreSto = {
  id: RUNTIME_SPINE_TENANT_PROCESS_IDS.stos.previewScore,
  flow: previewScoreFlowDefinition,
  inputContracts: [previewScoreInputContract],
  resultContracts: [scorePreviewResultContract],
};

export const flagReviewSto = {
  id: RUNTIME_SPINE_TENANT_PROCESS_IDS.stos.flagReview,
  flow: flagReviewFlowDefinition,
  inputContracts: [flagReviewInputContract],
  resultContracts: [reviewFlaggedResultContract],
};

export const autoDecisionSto = {
  id: RUNTIME_SPINE_TENANT_PROCESS_IDS.stos.autoDecision,
  flow: autoDecisionFlowDefinition,
  resultContracts: [autoDecisionResultContract],
};

export const summarizeReviewSto = {
  id: RUNTIME_SPINE_TENANT_PROCESS_IDS.stos.summarizeReview,
  flow: summarizeReviewFlowDefinition,
  resultContracts: [summaryResultContract],
};

export const generateReviewArtifactSto = {
  id: RUNTIME_SPINE_TENANT_PROCESS_IDS.stos.generateReviewArtifact,
  flow: generateReviewArtifactFlowDefinition,
  artifactContracts: [reviewSummaryArtifactContract],
  resultContracts: [artifactGeneratedResultContract],
};
