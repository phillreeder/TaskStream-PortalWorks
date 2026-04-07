import { describe, expect, it } from 'vitest';
import { validateState } from '../StateDefinitionValidator.js';
import type { StateDefinition } from '../../../entities/execution.ts';

const clone = <T>(value: T): T =>
  typeof structuredClone === 'function' ? structuredClone(value) : (JSON.parse(JSON.stringify(value)) as T);

const buildStateDefinition = (): StateDefinition => ({
  name: 'validator-test',
  schema: {
    properties: {
      session: {
        type: 'object',
        required: true,
        allowAdditionalProperties: false,
        properties: {
          handshake: {
            type: 'string',
            nullable: true,
            tags: ['immutable'],
          },
          status: {
            type: 'string',
            nullable: true,
          },
        },
      },
      flag: {
        type: 'boolean',
        nullable: true,
        tags: ['irreversible'],
      },
      dependent: {
        type: 'string',
        dependsOn: ['session.handshake'],
      },
      counters: {
        type: 'object',
        properties: {
          attempts: { type: 'number', nullable: true, tags: ['monotonic'] },
        },
      },
      payload: {
        type: 'object',
        allowAdditionalProperties: true,
      },
    },
    allowAdditionalProperties: false,
  },
  invariants: [
    {
      id: 'handshake-required-post',
      phases: ['post'],
      validate: ({ state }) => {
        const session = (state.session ?? {}) as Record<string, unknown>;
        return typeof session.handshake === 'string' && session.handshake.length > 0
          ? { valid: true }
          : {
              valid: false,
              path: 'session.handshake',
              message: 'handshake must exist after execution',
            };
      },
    },
  ],
});

const validState = {
  session: { handshake: 'abc', status: 'ready' },
  flag: true,
  dependent: 'value',
  counters: { attempts: 1 },
  payload: {},
};

describe('StateDefinitionValidator', () => {
  it('accepts valid state', () => {
    const result = validateState(validState, buildStateDefinition(), { phase: 'post' });
    expect(result.valid).toBe(true);
  });

  it('rejects missing required fields', () => {
    const result = validateState({}, buildStateDefinition());
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('session is required');
  });

  it('rejects invalid property types', () => {
    const result = validateState({ session: { handshake: 42 } }, buildStateDefinition());
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('session.handshake must be a string');
  });

  it('rejects unknown properties when not allowed', () => {
    const result = validateState(
      { session: { handshake: 'abc' }, unknown: true },
      buildStateDefinition(),
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('unknown is not defined in StateDefinition');
  });

  it('enforces dependsOn constraints', () => {
    const state = { session: { handshake: null }, dependent: 'value' };
    const result = validateState(state, buildStateDefinition());
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('dependent requires session.handshake to be present');
  });

  it('enforces immutable tag when previous state exists', () => {
    const state = { session: { handshake: 'new' } };
    const previousState = { session: { handshake: 'old' } };
    const result = validateState(state, buildStateDefinition(), { previousState });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('session.handshake is immutable once set');
  });

  it('enforces invariants per phase', () => {
    const state = { session: { handshake: null } };
    const result = validateState(state, buildStateDefinition(), { phase: 'post' });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('handshake must exist after execution');
  });

  it('produces deterministic results for the same input', () => {
    const definition = buildStateDefinition();
    const state = { session: { handshake: 'abc' } };
    const first = validateState(state, definition);
    const second = validateState(state, definition);
    expect(second).toEqual(first);
  });

  it('does not mutate the original state object', () => {
    const definition = buildStateDefinition();
    const state = { session: { handshake: 'abc' }, payload: { foo: 'bar' } };
    const snapshot = clone(state);
    validateState(state, definition, { phase: 'post' });
    expect(state).toEqual(snapshot);
  });

  it('fails gracefully on empty state objects', () => {
    const definition = buildStateDefinition();
    const result = validateState({} as Record<string, unknown>, definition);
    expect(result.valid).toBe(false);
  });

  it('handles large states deterministically', () => {
    const definition = buildStateDefinition();
    const payload: Record<string, number> = {};
    for (let index = 0; index < 200; index += 1) {
      payload[`key_${index}`] = index;
    }
    const state = { session: { handshake: 'abc' }, payload };
    const result = validateState(state, definition, { phase: 'pre' });
    expect(result.valid).toBe(true);
  });
});
