export const openLinkedInLandingInputContract = {
  fields: {
    accountRef: { type: 'string' },
    startUrl: { type: 'string' },
    anchorText: { type: 'string' },
    structureDepth: { type: 'number' },
    ancestorDepth: { type: 'number' },
    descendantDepth: { type: 'number' },
  },
} as const;

export const linkedInLandingCapturedResultContract = {
  fields: {
    phase: {
      type: 'enum',
      values: ['page_inspected'] as const,
    },
    currentPageRef: { type: 'string' },
    pagesInspected: { type: 'number' },
  },
} as const;

export const evidenceReviewPausedResultContract = {
  fields: {
    phase: {
      type: 'enum',
      values: ['page_inspected'] as const,
    },
    currentPageRef: { type: 'string' },
  },
} as const;
