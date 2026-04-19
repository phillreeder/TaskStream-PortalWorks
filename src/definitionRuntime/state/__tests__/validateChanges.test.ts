import { describe, expect, it } from 'vitest';
import {
  StateChangeValidationError,
  defineState,
  validateArrayOperationPayload,
  validateChanges,
  validateIntroducedArrayValues,
  validatePrimitiveChange,
} from '../index.js';

function createDefinition(options: { strict?: boolean; regex?: RegExp } = {}) {
  return defineState<{
    name: string;
    attempts: number;
    enabled: boolean;
    status: 'pending' | 'running' | 'done';
    tags: string[];
    items: { code: string; count: number }[];
  }>()({
    id: 'taskstream.test.change-validation',
    version: 1,
    strict: options.strict ?? true,
    defaults: {
      name: 'alpha',
      attempts: 1,
      enabled: false,
      status: 'pending',
      tags: ['a', 'b'],
      items: [{ code: 'A', count: 1 }],
    },
    fields: {
      name: {
        type: 'string',
        constraints: [{ kind: 'matches_regex', phase: 'change', payload: { pattern: options.regex ?? /^[a-z]+$/ } }],
      },
      attempts: {
        type: 'number',
        constraints: [
          { kind: 'min_value', phase: 'change', payload: { value: 0 } },
          { kind: 'max_value', phase: 'change', payload: { value: 3 } },
        ],
      },
      enabled: {
        type: 'boolean',
      },
      status: {
        type: 'enum',
        values: ['pending', 'running', 'done'] as const,
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
              constraints: [{ kind: 'matches_regex', phase: 'change', payload: { pattern: /^[A-Z]$/ } }],
            },
            count: {
              type: 'number',
              constraints: [{ kind: 'min_value', phase: 'change', payload: { value: 0 } }],
            },
          },
        },
      },
    },
  });
}

function createPreviousState() {
  return {
    name: 'alpha',
    attempts: 1,
    enabled: false,
    status: 'pending',
    tags: ['a', 'b'],
    items: [{ code: 'A', count: 1 }],
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

describe('validateChanges', () => {
  it('accepts valid primitive and array changes without mutating previous state', () => {
    const definition = createDefinition();
    const previousState = createPreviousState();
    const changes = {
      name: 'beta',
      attempts: 2,
      enabled: true,
      status: 'running' as const,
      tags: { op: 'append' as const, payload: { value: 'c' } },
      items: { op: 'replace' as const, payload: [{ code: 'B', count: 2 }] },
    };

    const result = validateChanges(definition, previousState, changes);

    expect(result).toBe(changes);
    expect(previousState).toEqual(createPreviousState());
  });

  it('rejects definitions that were not created by defineState', () => {
    expectChangeError(
      () =>
        validateChanges(
          {
            id: 'invalid',
            version: 1,
            strict: true,
            defaults: {},
            fields: {},
          } as never,
          {},
          {},
        ),
      {
        code: 'UNVALIDATED_DEFINITION',
        path: 'definition',
        message: 'definition must be a validated StateDefinition created by defineState()',
      },
    );
  });

  it('rejects unknown fields in strict mode', () => {
    expectChangeError(
      () => validateChanges(createDefinition(), createPreviousState(), { unknownField: 123 } as never),
      {
        code: 'UNKNOWN_FIELD',
        path: 'stateChanges.unknownField',
        message: 'stateChanges.unknownField is not declared in definition.fields',
      },
    );
  });

  it('allows unknown fields when strict mode is disabled', () => {
    expect(() =>
      validateChanges(createDefinition({ strict: false }), createPreviousState(), { unknownField: 123 } as never),
    ).not.toThrow();
  });

  it('rejects invalid primitive and enum updates', () => {
    expectChangeError(
      () => validateChanges(createDefinition(), createPreviousState(), { attempts: 'two' } as never),
      {
        code: 'INVALID_FIELD_VALUE',
        path: 'stateChanges.attempts',
        message: 'stateChanges.attempts must be a finite number, received string',
      },
    );

    expectChangeError(
      () => validateChanges(createDefinition(), createPreviousState(), { status: 'stalled' } as never),
      {
        code: 'INVALID_FIELD_VALUE',
        path: 'stateChanges.status',
        message: 'stateChanges.status must be one of [pending, running, done]',
      },
    );
  });

  it('enforces change-phase constraints deterministically', () => {
    expectChangeError(
      () => validateChanges(createDefinition(), createPreviousState(), { attempts: -1 }),
      {
        code: 'CHANGE_CONSTRAINT_VIOLATION',
        path: 'stateChanges.attempts',
        message: 'stateChanges.attempts must be greater than or equal to 0',
      },
    );

    const definition = createDefinition({ regex: /^[a-z]+$/g });
    const previousState = createPreviousState();
    expect(() => validateChanges(definition, previousState, { name: 'beta' })).not.toThrow();
    expect(() => validateChanges(definition, previousState, { name: 'beta' })).not.toThrow();
  });

  it('rejects raw array mutations and malformed array payloads', () => {
    expectChangeError(
      () => validateChanges(createDefinition(), createPreviousState(), { tags: ['c'] } as never),
      {
        code: 'INVALID_ARRAY_OPERATION',
        path: 'stateChanges.tags',
        message: 'stateChanges.tags must be an explicit array operation object',
      },
    );

    expectChangeError(
      () =>
        validateChanges(createDefinition(), createPreviousState(), {
          tags: { op: 'set_index', payload: { value: 'c' } },
        } as never),
      {
        code: 'INVALID_ARRAY_PAYLOAD',
        path: 'stateChanges.tags.payload.index',
        message: 'stateChanges.tags.payload.index is required for "set_index"',
      },
    );

    expectChangeError(
      () =>
        validateChanges(createDefinition(), createPreviousState(), {
          tags: { op: 'replace', payload: 'bad' },
        } as never),
      {
        code: 'INVALID_ARRAY_PAYLOAD',
        path: 'stateChanges.tags.payload',
        message: 'stateChanges.tags.payload must be an array for "replace"',
      },
    );
  });

  it('validates supported array operations and index semantics', () => {
    const definition = createDefinition();
    const previousState = createPreviousState();

    expect(() =>
      validateChanges(definition, previousState, { tags: { op: 'set_index', payload: { index: 1, value: 'z' } } }),
    ).not.toThrow();
    expect(() =>
      validateChanges(definition, previousState, { tags: { op: 'remove_index', payload: { index: 0 } } }),
    ).not.toThrow();
    expect(() => validateChanges(definition, previousState, { tags: { op: 'pop' } })).not.toThrow();
    expect(() => validateChanges(definition, previousState, { tags: { op: 'shift' } })).not.toThrow();

    expectChangeError(
      () =>
        validateChanges(definition, previousState, {
          tags: { op: 'set_index', payload: { index: 99, value: 'z' } },
        }),
      {
        code: 'ARRAY_INDEX_OUT_OF_BOUNDS',
        path: 'stateChanges.tags.payload.index',
        message: 'stateChanges.tags.payload.index 99 is out of bounds for current array length 2',
      },
    );

    expectChangeError(
      () => validateChanges(definition, { ...previousState, tags: [] }, { tags: { op: 'pop' } }),
      {
        code: 'ARRAY_OPERATION_NOT_ALLOWED',
        path: 'stateChanges.tags',
        message: 'stateChanges.tags cannot use "pop" on an empty array',
      },
    );
  });

  it('validates inline object array items element by element', () => {
    expect(() =>
      validateChanges(createDefinition(), createPreviousState(), {
        items: { op: 'replace', payload: [{ code: 'B', count: 2 }] },
      }),
    ).not.toThrow();

    expectChangeError(
      () =>
        validateChanges(createDefinition(), createPreviousState(), {
          items: { op: 'append', payload: { value: { code: 'B', count: 'bad' } } },
        } as never),
      {
        code: 'INVALID_FIELD_VALUE',
        path: 'stateChanges.items.payload.value.count',
        message: 'stateChanges.items.payload.value.count must be a finite number, received string',
      },
    );

    expectChangeError(
      () =>
        validateChanges(createDefinition(), createPreviousState(), {
          items: { op: 'replace', payload: [{ code: 'B' }] },
        } as never),
      {
        code: 'INVALID_FIELD_VALUE',
        path: 'stateChanges.items.payload[0].count',
        message: 'stateChanges.items.payload[0].count is required',
      },
    );
  });

  it('uses a stable rejection order regardless of stateChanges key insertion order', () => {
    const definition = createDefinition();
    const previousState = createPreviousState();

    const first = () => validateChanges(definition, previousState, { attempts: 'two', unknownField: 1 } as never);
    const second = () => validateChanges(definition, previousState, { unknownField: 1, attempts: 'two' } as never);

    for (const candidate of [first, second]) {
      expectChangeError(candidate, {
        code: 'INVALID_FIELD_VALUE',
        path: 'stateChanges.attempts',
        message: 'stateChanges.attempts must be a finite number, received string',
      });
    }
  });
});

describe('change validation helpers', () => {
  it('validates primitive changes directly', () => {
    expect(() => validatePrimitiveChange({ type: 'boolean' }, true, 'stateChanges.enabled')).not.toThrow();

    expectChangeError(
      () => validatePrimitiveChange({ type: 'boolean' }, 'yes', 'stateChanges.enabled' as never),
      {
        code: 'INVALID_FIELD_VALUE',
        path: 'stateChanges.enabled',
        message: 'stateChanges.enabled must be a boolean, received string',
      },
    );
  });

  it('validates array payload helpers directly', () => {
    expect(() =>
      validateArrayOperationPayload(
        { type: 'array', items: { type: 'string' } },
        ['a'],
        'append',
        { value: 'b' },
        'stateChanges.tags',
      ),
    ).not.toThrow();

    expectChangeError(
      () =>
        validateArrayOperationPayload(
          { type: 'array', items: { type: 'string' } },
          ['a'],
          'remove_index',
          { index: -1 },
          'stateChanges.tags',
        ),
      {
        code: 'INVALID_ARRAY_PAYLOAD',
        path: 'stateChanges.tags.payload.index',
        message: 'stateChanges.tags.payload.index must be a non-negative integer for "remove_index"',
      },
    );
  });

  it('validates introduced array values directly', () => {
    expect(() => validateIntroducedArrayValues({ type: 'string' }, 'value', 'stateChanges.tags.payload[0]')).not.toThrow();

    expectChangeError(
      () =>
        validateIntroducedArrayValues(
          {
            type: 'object_inline',
            fields: {
              code: { type: 'string' },
              count: { type: 'number' },
            },
          },
          { code: 'A', extra: true },
          'stateChanges.items.payload[0]',
        ),
      {
        code: 'INVALID_FIELD_VALUE',
        path: 'stateChanges.items.payload[0].count',
        message: 'stateChanges.items.payload[0].count is required',
      },
    );
  });
});
