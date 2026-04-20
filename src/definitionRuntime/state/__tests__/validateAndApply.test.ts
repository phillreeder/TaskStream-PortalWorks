import { describe, expect, it } from 'vitest';
import {
  StateChangeValidationError,
  applyArrayOperation,
  applyChanges,
  defineState,
  evaluateRequiredIf,
  validateAndApply,
  validateState,
} from '../index.js';

type RuntimeState = {
  name: string;
  attempts: number;
  enabled: boolean;
  status: 'pending' | 'running' | 'done';
  note: string;
  tags: string[];
  items: { code: string; count: number }[];
  token: string;
  issuedAt: number;
};

const fixedNow = Date.parse('2024-01-01T00:00:00.000Z');

function createDefinition(options: { strict?: boolean } = {}) {
  return defineState<RuntimeState>()({
    id: 'taskstream.test.state-execution',
    version: 1,
    strict: options.strict ?? true,
    defaults: {
      name: 'alpha',
      attempts: 1,
      enabled: false,
      status: 'pending',
      note: '',
      tags: ['a', 'b'],
      items: [{ code: 'A', count: 1 }],
      token: 'token-1',
      issuedAt: fixedNow,
    },
    fields: {
      name: {
        type: 'string',
      },
      attempts: {
        type: 'number',
      },
      enabled: {
        type: 'boolean',
      },
      status: {
        type: 'enum',
        values: ['pending', 'running', 'done'] as const,
      },
      note: {
        type: 'string',
        constraints: [
          {
            kind: 'required_if',
            phase: 'state',
            payload: { predicate: (state) => state.status === 'running' },
          },
        ],
      },
      tags: {
        type: 'array',
        items: {
          type: 'string',
        },
      },
      items: {
        type: 'array',
        items: {
          type: 'object_inline',
          fields: {
            code: {
              type: 'string',
            },
            count: {
              type: 'number',
            },
          },
        },
      },
      token: {
        type: 'string',
        constraints: [
          {
            kind: 'time_to_live',
            phase: 'state',
            payload: { ms: 1000, fromField: 'issuedAt' },
          },
        ],
      },
      issuedAt: {
        type: 'number',
      },
    },
  });
}

function createPreviousState(): RuntimeState {
  return {
    name: 'alpha',
    attempts: 1,
    enabled: false,
    status: 'pending',
    note: '',
    tags: ['a', 'b'],
    items: [{ code: 'A', count: 1 }],
    token: 'token-1',
    issuedAt: fixedNow,
  };
}

function expectChangeError(
  callback: () => unknown,
  expected: { code: string; path: string; message: string },
): void {
  try {
    callback();
    throw new Error('Expected a StateChangeValidationError');
  } catch (error) {
    expect(error).toBeInstanceOf(StateChangeValidationError);
    const typedError = error as StateChangeValidationError;
    expect(typedError.code).toBe(expected.code);
    expect(typedError.path).toBe(expected.path);
    expect(typedError.message).toBe(expected.message);
  }
}

describe('applyChanges', () => {
  it('applies primitive and array changes without mutating previous state or payload objects', () => {
    const definition = createDefinition();
    const previousState = createPreviousState();
    const appendedItem = { code: 'B', count: 2 };

    const nextState = applyChanges(definition, previousState, {
      name: 'beta',
      enabled: true,
      status: 'running',
      note: 'ready',
      tags: { op: 'append', payload: { value: 'c' } },
      items: { op: 'append', payload: { value: appendedItem } },
    });

    expect(nextState).toEqual({
      ...createPreviousState(),
      name: 'beta',
      enabled: true,
      status: 'running',
      note: 'ready',
      tags: ['a', 'b', 'c'],
      items: [
        { code: 'A', count: 1 },
        { code: 'B', count: 2 },
      ],
    });
    expect(previousState).toEqual(createPreviousState());
    expect(nextState.tags).not.toBe(previousState.tags);
    expect(nextState.items).not.toBe(previousState.items);
    expect(nextState.items[1]).not.toBe(appendedItem);
  });

  it('supports every array operation through the interpreter', () => {
    const tagsDefinition = createDefinition().fields.tags;
    const previousValue = ['a', 'b', 'c'] as const;

    expect(applyArrayOperation(tagsDefinition, previousValue, { op: 'replace', payload: ['x'] })).toEqual(['x']);
    expect(
      applyArrayOperation(tagsDefinition, previousValue, { op: 'set_index', payload: { index: 1, value: 'x' } }),
    ).toEqual(['a', 'x', 'c']);
    expect(applyArrayOperation(tagsDefinition, previousValue, { op: 'append', payload: { value: 'x' } })).toEqual([
      'a',
      'b',
      'c',
      'x',
    ]);
    expect(applyArrayOperation(tagsDefinition, previousValue, { op: 'remove_index', payload: { index: 1 } })).toEqual([
      'a',
      'c',
    ]);
    expect(applyArrayOperation(tagsDefinition, previousValue, { op: 'pop' })).toEqual(['a', 'b']);
    expect(applyArrayOperation(tagsDefinition, previousValue, { op: 'shift' })).toEqual(['b', 'c']);
  });
});

describe('validateState', () => {
  it('accepts valid resulting state and preserves unknown fields when strict mode is disabled', () => {
    const definition = createDefinition({ strict: false });
    const nextState = {
      ...createPreviousState(),
      extra: true,
    };

    expect(validateState(definition, nextState)).toBe(nextState);
  });

  it('rejects invalid field types, enum values, and unknown fields deterministically', () => {
    expectChangeError(
      () =>
        validateState(createDefinition(), {
          ...createPreviousState(),
          attempts: 'two',
        } as never),
      {
        code: 'INVALID_NEXT_STATE',
        path: 'nextState.attempts',
        message: 'nextState.attempts must be a finite number, received string',
      },
    );

    expectChangeError(
      () =>
        validateState(createDefinition(), {
          ...createPreviousState(),
          status: 'stalled',
        } as never),
      {
        code: 'INVALID_NEXT_STATE',
        path: 'nextState.status',
        message: 'nextState.status must be one of [pending, running, done]',
      },
    );

    expectChangeError(
      () =>
        validateState(createDefinition(), {
          ...createPreviousState(),
          unknownField: true,
        } as never),
      {
        code: 'UNKNOWN_FIELD',
        path: 'nextState.unknownField',
        message: 'nextState.unknownField is not declared in definition.fields',
      },
    );
  });

  it('enforces required_if and time_to_live state constraints', () => {
    expectChangeError(
      () =>
        validateState(createDefinition(), {
          ...createPreviousState(),
          status: 'running',
          note: '',
        }),
      {
        code: 'STATE_CONSTRAINT_VIOLATION',
        path: 'nextState.note',
        message: 'nextState.note is required by state constraint "required_if"',
      },
    );

    expectChangeError(
      () =>
        validateState(createDefinition(), {
          ...createPreviousState(),
          issuedAt: fixedNow - 1001,
        }),
      {
        code: 'STATE_CONSTRAINT_VIOLATION',
        path: 'nextState.token',
        message: 'nextState.token exceeded time_to_live of 1000ms',
      },
    );
  });
});

describe('validateAndApply', () => {
  it('returns nextState for valid input', () => {
    const nextState = validateAndApply(createDefinition(), createPreviousState(), {
      status: 'running',
      note: 'ready',
      tags: { op: 'append', payload: { value: 'c' } },
      issuedAt: fixedNow,
    });

    expect(nextState).toEqual({
      ...createPreviousState(),
      status: 'running',
      note: 'ready',
      tags: ['a', 'b', 'c'],
    });
  });

  it('rejects invalid resulting state after applying otherwise valid changes', () => {
    expectChangeError(
      () =>
        validateAndApply(createDefinition(), createPreviousState(), {
          issuedAt: fixedNow - 1001,
        }),
      {
        code: 'STATE_CONSTRAINT_VIOLATION',
        path: 'nextState.token',
        message: 'nextState.token exceeded time_to_live of 1000ms',
      },
    );
  });
});

describe('state constraint helpers', () => {
  it('evaluates required_if directly', () => {
    expect(() =>
      evaluateRequiredIf('', (state) => state.enabled === false, { enabled: false }, 'nextState.note'),
    ).toThrowError(new StateChangeValidationError(
      'nextState.note is required by state constraint "required_if"',
      'STATE_CONSTRAINT_VIOLATION',
      'nextState.note',
    ));

    expect(() =>
      evaluateRequiredIf('ready', (state) => state.enabled === true, { enabled: true }, 'nextState.note'),
    ).not.toThrow();
  });
});
