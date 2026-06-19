import { defineState } from '../../../definitionRuntime/state/defineState.js';
import { IEBBETA_TEST1_TENANT_PROCESS_IDS } from './ids.js';

export const test1ProcessWorkStateDefinition = defineState<{
  status: 'pending' | 'prepared' | 'materialized' | 'failed';
  sourceEventId: string;
  sourceQueueItemId: string;
  workEntryId: string;
  lastError: string;
}>()({
  id: IEBBETA_TEST1_TENANT_PROCESS_IDS.stateDefinition,
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
