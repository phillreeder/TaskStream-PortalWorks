import { describe, expect, it } from 'vitest';
import { createStateSession, defineState } from '../index.js';

type RuntimeState = {
  count: number;
  status: 'pending' | 'running';
  tags: string[];
};

function createDefinition(options: { strict?: boolean } = {}) {
  return defineState<RuntimeState>()({
    id: 'taskstream.test.state-session',
    version: 1,
    strict: options.strict ?? true,
    defaults: {
      count: 1,
      status: 'pending',
      tags: ['a', 'b'],
    },
    fields: {
      count: {
        type: 'number',
      },
      status: {
        type: 'enum',
        values: ['pending', 'running'] as const,
      },
      tags: {
        type: 'array',
        items: {
          type: 'string',
        },
      },
    },
  });
}

function createPreviousState(): RuntimeState {
  return {
    count: 1,
    status: 'pending',
    tags: ['a', 'b'],
  };
}

describe('createStateSession', () => {
  it('stages valid primitive changes, validates on write, and preserves chaining', () => {
    const session = createStateSession(createDefinition(), createPreviousState());

    const chained = session.set('count', 2).set('status', 'running');
    const validation = session.validationResult();

    expect(chained).toBe(session);
    expect(session.toChanges()).toEqual({
      count: 2,
      status: 'running',
    });
    expect(validation).toEqual({
      valid: true,
      changes: {
        count: 2,
        status: 'running',
      },
    });
    expect(session.validate_partial()()).toBe(true);
  });

  it('captures invalid primitive validation results without throwing and still stages the change', () => {
    const session = createStateSession(createDefinition(), createPreviousState());

    expect(() => session.set('count', 'two' as never)).not.toThrow();

    expect(session.toChanges()).toEqual({
      count: 'two',
    });
    expect(session.validationResult()).toEqual({
      valid: false,
      changes: {
        count: 'two',
      },
      error: {
        code: 'INVALID_FIELD_VALUE',
        path: 'stateChanges.count',
        message: 'stateChanges.count must be a finite number, received string',
      },
    });
    expect(session.validate_partial()()).toBe(false);
  });

  it('marks unknown fields invalid in strict mode without interrupting execution', () => {
    const session = createStateSession(createDefinition({ strict: true }), createPreviousState());

    expect(() => session.set('unknownField' as never, 123 as never)).not.toThrow();

    expect(session.toChanges()).toEqual({
      unknownField: 123,
    });
    expect(session.validationResult()).toEqual({
      valid: false,
      changes: {
        unknownField: 123,
      },
      error: {
        code: 'UNKNOWN_FIELD',
        path: 'stateChanges.unknownField',
        message: 'stateChanges.unknownField is not declared in definition.fields',
      },
    });
  });

  it('passes valid array operations through to validateChanges without interpreting them', () => {
    const session = createStateSession(createDefinition(), createPreviousState());

    session.set('tags', { op: 'append', payload: { value: 'c' } });

    expect(session.toChanges()).toEqual({
      tags: { op: 'append', payload: { value: 'c' } },
    });
    expect(session.validationResult()).toEqual({
      valid: true,
      changes: {
        tags: { op: 'append', payload: { value: 'c' } },
      },
    });
  });

  it('stores invalid array operation results without throwing', () => {
    const session = createStateSession(createDefinition(), createPreviousState());

    expect(() =>
      session.set('tags', {
        op: 'set_index',
        payload: {
          index: 99,
          value: 'c',
        },
      }),
    ).not.toThrow();

    expect(session.validationResult()).toEqual({
      valid: false,
      changes: {
        tags: {
          op: 'set_index',
          payload: {
            index: 99,
            value: 'c',
          },
        },
      },
      error: {
        code: 'ARRAY_INDEX_OUT_OF_BOUNDS',
        path: 'stateChanges.tags.payload.index',
        message: 'stateChanges.tags.payload.index 99 is out of bounds for current array length 2',
      },
    });
  });

  it('produces deterministic validation results for repeated identical sequences', () => {
    const definition = createDefinition();
    const previousState = createPreviousState();

    const first = createStateSession(definition, previousState);
    const second = createStateSession(definition, previousState);

    first.set('count', 2).set('tags', { op: 'append', payload: { value: 'c' } });
    second.set('count', 2).set('tags', { op: 'append', payload: { value: 'c' } });

    expect(first.toChanges()).toEqual(second.toChanges());
    expect(first.validationResult()).toEqual(second.validationResult());
  });
});
