import type { StateDefinition } from '../../../../../../domain/entities/execution.ts';

const handshakeInvariant = {
  id: 'session.handshake.initialize',
  phases: ['post'] as const,
  validate: ({ state }) => {
    const session = (state.session ?? {}) as Record<string, unknown>;
    return session.handshake
      ? { valid: true }
      : {
          valid: false,
          path: 'session.handshake',
          message: 'session.handshake must be populated during initialization',
        };
  },
};

export const stateDefinition: StateDefinition = {
  name: 'taskstream.default-state',
  schema: {
    properties: {
      session: {
        type: 'object',
        required: true,
        properties: {
          handshake: {
            type: 'string',
            nullable: true,
            tags: ['immutable'],
          },
          status: {
            type: 'object',
            allowAdditionalProperties: true,
            properties: {
              ready: {
                type: 'boolean',
                nullable: true,
              },
            },
          },
        },
      },
    },
    allowAdditionalProperties: false,
  },
  invariants: [handshakeInvariant],
  stos: {
    'sto.taskstream.initialize': {
      stoKey: 'sto.taskstream.initialize',
      errorMessage: 'Initialization STO can only run before the handshake has been set',
      when: (state) => {
        const session = (state.session ?? {}) as Record<string, unknown>;
        return session.handshake === undefined || session.handshake === null;
      },
    },
  },
};
