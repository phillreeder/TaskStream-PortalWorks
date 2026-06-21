export const test1ProcessWorkStateDefinition = {
  id: 'processWork',
  version: 1,
  strict: true,

  defaults: {
    status: 'pending',
    sourceEventId: '',
    sourceQueueItemId: '',
    workEntryId: '',
    lastError: '',
  },

  fields: {
    status: {
      type: 'enum',
      values: ['pending', 'prepared', 'materialized', 'failed'] as const,
    },
    sourceEventId: { type: 'string' },
    sourceQueueItemId: { type: 'string' },
    workEntryId: { type: 'string' },
    lastError: { type: 'string' },
  },
} as const;
