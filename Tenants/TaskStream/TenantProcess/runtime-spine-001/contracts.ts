import { RUNTIME_SPINE_TENANT_PROCESS_IDS } from './ids.js';

export const startReviewInputContract = {
  id: RUNTIME_SPINE_TENANT_PROCESS_IDS.inputContracts.startReview,
  inputKind: 'json',
  schemaRef: 'schema.review-submission.start-input',
};

export const previewScoreInputContract = {
  id: RUNTIME_SPINE_TENANT_PROCESS_IDS.inputContracts.previewScore,
  inputKind: 'json',
  schemaRef: 'schema.review-submission.score-input',
};

export const flagReviewInputContract = {
  id: RUNTIME_SPINE_TENANT_PROCESS_IDS.inputContracts.flagReview,
  inputKind: 'json',
  schemaRef: 'schema.review-submission.flag-input',
};

export const reviewSummaryArtifactContract = {
  id: RUNTIME_SPINE_TENANT_PROCESS_IDS.artifactContracts.reviewSummaryJson,
  artifactKind: 'json',
  schemaRef: 'schema.review-submission.summary-artifact',
  required: false,
};

export const reviewStartedResultContract = {
  id: RUNTIME_SPINE_TENANT_PROCESS_IDS.resultContracts.reviewStarted,
  schemaRef: 'schema.review-submission.started-result',
  statusValues: ['succeeded', 'failed', 'cancelled'],
};

export const scorePreviewResultContract = {
  id: RUNTIME_SPINE_TENANT_PROCESS_IDS.resultContracts.scorePreview,
  schemaRef: 'schema.review-submission.score-preview-result',
  statusValues: ['succeeded', 'failed', 'cancelled'],
};

export const reviewFlaggedResultContract = {
  id: RUNTIME_SPINE_TENANT_PROCESS_IDS.resultContracts.reviewFlagged,
  schemaRef: 'schema.review-submission.flagged-result',
  statusValues: ['succeeded', 'failed', 'cancelled'],
};

export const autoDecisionResultContract = {
  id: RUNTIME_SPINE_TENANT_PROCESS_IDS.resultContracts.autoDecision,
  schemaRef: 'schema.review-submission.auto-decision-result',
  statusValues: ['succeeded', 'failed', 'cancelled'],
};

export const summaryResultContract = {
  id: RUNTIME_SPINE_TENANT_PROCESS_IDS.resultContracts.summary,
  schemaRef: 'schema.review-submission.summary-result',
  statusValues: ['succeeded', 'failed', 'cancelled'],
};

export const artifactGeneratedResultContract = {
  id: RUNTIME_SPINE_TENANT_PROCESS_IDS.resultContracts.artifactGenerated,
  schemaRef: 'schema.review-submission.artifact-generated-result',
  statusValues: ['succeeded', 'failed', 'cancelled'],
};
