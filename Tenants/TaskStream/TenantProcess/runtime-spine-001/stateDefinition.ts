import { defineState } from '@TaskStream/App/definitionRuntime/state/defineState.js';
import { RUNTIME_SPINE_TENANT_PROCESS_IDS } from './ids.js';

export const reviewSubmissionStateDefinition = defineState<{
  status: 'pending' | 'in_review' | 'approved' | 'rejected';
  score: number;
  reviewed: boolean;
  reviewerNotes: string;
  flags: readonly string[];
}>()({
  id: RUNTIME_SPINE_TENANT_PROCESS_IDS.stateDefinition,
  version: 1,
  strict: true,

  defaults: {
    status: 'pending',
    score: 0,
    reviewed: false,
    reviewerNotes: '',
    flags: [],
  },

  fields: {
    status: {
      type: 'enum',
      values: ['pending', 'in_review', 'approved', 'rejected'] as const,
    },

    score: {
      type: 'number',
      constraints: [
        {
          kind: 'min_value',
          phase: 'change',
          payload: { value: 0 },
        },
        {
          kind: 'max_value',
          phase: 'change',
          payload: { value: 100 },
        },
      ],
    },

    reviewed: {
      type: 'boolean',
    },

    reviewerNotes: {
      type: 'string',
    },

    flags: {
      type: 'array',
      items: {
        type: 'string',
      },
    },
  },
});
