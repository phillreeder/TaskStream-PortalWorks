export const openLinkedInLandingSto = {
  authority: 'task',
  flow: 'openLinkedInLanding',
  inputContracts: ['openLinkedInLanding'],
  resultContracts: ['linkedInLandingCaptured'],
  web: {
    kind: 'browser-stream',
    access: 'exclusive',
    pagePolicy: {
      mode: 'reuse-or-create',
      semanticKey: 'linkedin-primary',
    },
    waitPolicy: { mode: 'fail-fast' },
    releaseDisposition: 'retain-without-checkpoint',
  },
} as const;

export const pauseForEvidenceReviewSto = {
  authority: 'task',
  flow: 'pauseForEvidenceReview',
  resultContracts: ['evidenceReviewPaused'],
} as const;
