export const prepareWorkInputContract = {
  fields: {
    status: {
      type: 'enum',
      values: ['pending'] as const,
    },
    sourceEventId: { type: 'string' },
    sourceQueueItemId: { type: 'string' },
  },
} as const;

export const workPreparedResultContract = {
  fields: {
    status: {
      type: 'enum',
      values: ['prepared'] as const,
    },
    sourceEventId: { type: 'string' },
    sourceQueueItemId: { type: 'string' },
    workEntryId: { type: 'string' },
    lastError: { type: 'string' },
  },
} as const;

export const workInspectedResultContract = {
  fields: {
    status: {
      type: 'enum',
      values: ['prepared'] as const,
    },
    sourceEventId: { type: 'string' },
    sourceQueueItemId: { type: 'string' },
    workEntryId: { type: 'string' },
    lastError: { type: 'string' },
  },
} as const;
