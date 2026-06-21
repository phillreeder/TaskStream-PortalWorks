import { defineState } from '@TaskStream/App/definitionRuntime/state/defineState.js';

export const test1ProcessWorkStateDefinition = defineState<{
  status: 'pending' | 'prepared' | 'materialized' | 'failed';
  sourceEventId: string;
  sourceQueueItemId: string;
  workEntryId: string;
  lastError: string;
}>()({
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
});
