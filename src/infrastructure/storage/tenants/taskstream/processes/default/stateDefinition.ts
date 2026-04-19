import { defineState } from '../../../../../../definitionRuntime/state/defineState.js';

export const stateDefinition = defineState<{
  'session.handshake': string;
  'session.status.ready': boolean;
  'session.phase': 'pending' | 'ready';
}>()({
  id: 'taskstream.default-state',
  version: 1,
  strict: true,
  defaults: {
    'session.handshake': '',
    'session.status.ready': false,
    'session.phase': 'pending',
  },
  fields: {
    'session.handshake': {
      type: 'string',
      constraints: [
        {
          kind: 'required_if',
          phase: 'state',
          payload: {
            predicate: (state) => state['session.phase'] === 'ready',
          },
        },
      ],
    },
    'session.status.ready': {
      type: 'boolean',
    },
    'session.phase': {
      type: 'enum',
      values: ['pending', 'ready'] as const,
    },
  },
});
