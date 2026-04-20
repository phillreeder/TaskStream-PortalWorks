import { describe, expect, it } from 'vitest';
import { applyChanges, areStructurallyEqual, compare, createDiff, defineState } from '../index.js';

type RuntimeState = {
  status: 'pending' | 'running';
  count: number;
  enabled: boolean;
  items: { code: string; count: number }[];
};

function createDefinition() {
  return defineState<RuntimeState>()({
    id: 'taskstream.test.state-comparison',
    version: 1,
    strict: true,
    defaults: {
      status: 'pending',
      count: 1,
      enabled: true,
      items: [{ code: 'A', count: 1 }],
    },
    fields: {
      status: {
        type: 'enum',
        values: ['pending', 'running'] as const,
      },
      count: {
        type: 'number',
      },
      enabled: {
        type: 'boolean',
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
    },
  });
}

function createState(): RuntimeState {
  return {
    status: 'pending',
    count: 1,
    enabled: true,
    items: [{ code: 'A', count: 1 }],
  };
}

describe('compare', () => {
  it('returns equal for identical primitive-only states and omits diff', () => {
    expect(
      compare(
        { status: 'pending', count: 1, enabled: true },
        { status: 'pending', count: 1, enabled: true },
      ),
    ).toEqual({ equal: true });
  });

  it('detects changed primitive, added, and removed top-level fields', () => {
    expect(
      compare(
        { status: 'pending', count: 1, error: 'timeout' },
        { status: 'pending', count: 2, result: 'ok' },
      ),
    ).toEqual({
      equal: false,
      diff: {
        added: {
          result: 'ok',
        },
        removed: {
          error: 'timeout',
        },
        changed: {
          count: {
            prev: 1,
            next: 2,
          },
        },
      },
    });
  });

  it('treats type differences as unequal without coercion', () => {
    expect(compare({ count: 1, enabled: true }, { count: '1', enabled: 1 })).toEqual({
      equal: false,
      diff: {
        added: {},
        removed: {},
        changed: {
          count: {
            prev: 1,
            next: '1',
          },
          enabled: {
            prev: true,
            next: 1,
          },
        },
      },
    });
  });

  it('compares nested objects by key presence and nested values', () => {
    expect(
      compare(
        { metadata: { retries: 1, mode: 'fast', note: undefined } },
        { metadata: { retries: 2, mode: 'fast' } },
      ),
    ).toEqual({
      equal: false,
      diff: {
        added: {},
        removed: {},
        changed: {
          metadata: {
            prev: { retries: 1, mode: 'fast', note: undefined },
            next: { retries: 2, mode: 'fast' },
          },
        },
      },
    });
  });

  it('compares arrays by ordered position, item value, and length', () => {
    expect(compare({ items: ['a', 'b', 'c'] }, { items: ['a', 'b', 'c'] })).toEqual({ equal: true });

    expect(compare({ items: ['a', 'b', 'c'] }, { items: ['b', 'a', 'c'] }).diff?.changed.items).toEqual({
      prev: ['a', 'b', 'c'],
      next: ['b', 'a', 'c'],
    });

    expect(compare({ items: ['a', 'b'] }, { items: ['a', 'b', 'c'] }).diff?.changed.items).toEqual({
      prev: ['a', 'b'],
      next: ['a', 'b', 'c'],
    });
  });

  it('compares arrays of inline objects structurally', () => {
    expect(
      compare(
        {
          items: [
            { code: 'A', count: 1 },
            { code: 'B', count: 2 },
          ],
        },
        {
          items: [
            { code: 'A', count: 1 },
            { code: 'B', count: 3 },
          ],
        },
      ),
    ).toEqual({
      equal: false,
      diff: {
        added: {},
        removed: {},
        changed: {
          items: {
            prev: [
              { code: 'A', count: 1 },
              { code: 'B', count: 2 },
            ],
            next: [
              { code: 'A', count: 1 },
              { code: 'B', count: 3 },
            ],
          },
        },
      },
    });
  });

  it('is deterministic across repeated identical comparisons', () => {
    const prevState = {
      zeta: 1,
      alpha: 'same',
      nested: {
        enabled: true,
      },
    };
    const nextState = {
      alpha: 'same',
      beta: 'added',
      nested: {
        enabled: false,
      },
      zeta: 2,
    };

    const firstResult = compare(prevState, nextState);
    const secondResult = compare(prevState, nextState);
    const firstDiff = createDiff(prevState, nextState);
    const secondDiff = createDiff(prevState, nextState);

    expect(firstResult).toEqual(secondResult);
    expect(firstDiff).toEqual(secondDiff);
    expect(Object.keys(firstDiff.added)).toEqual(['beta']);
    expect(Object.keys(firstDiff.removed)).toEqual([]);
    expect(Object.keys(firstDiff.changed)).toEqual(['nested', 'zeta']);
  });

  it('does not mutate snapshots and works independently after applyChanges', () => {
    const definition = createDefinition();
    const previousState = createState();
    const previousSnapshot = structuredClone(previousState);
    const nextState = applyChanges(definition, previousState, {
      count: 2,
      items: {
        op: 'append',
        payload: {
          value: { code: 'B', count: 2 },
        },
      },
    });
    const nextSnapshot = structuredClone(nextState);

    const result = compare(previousState, nextState);

    expect(result.equal).toBe(false);
    expect(result.diff?.changed.count).toEqual({ prev: 1, next: 2 });
    expect(result.diff?.changed.items).toEqual({
      prev: [{ code: 'A', count: 1 }],
      next: [
        { code: 'A', count: 1 },
        { code: 'B', count: 2 },
      ],
    });
    expect(previousState).toEqual(previousSnapshot);
    expect(nextState).toEqual(nextSnapshot);
  });
});

describe('areStructurallyEqual', () => {
  it('compares primitives, objects, and arrays with explicit structural semantics', () => {
    expect(areStructurallyEqual('pending', 'pending')).toBe(true);
    expect(areStructurallyEqual('1', 1)).toBe(false);
    expect(areStructurallyEqual([], [])).toBe(true);
    expect(areStructurallyEqual(['a', 'b'], ['b', 'a'])).toBe(false);
    expect(areStructurallyEqual({ a: 1, nested: { b: true } }, { a: 1, nested: { b: true } })).toBe(true);
    expect(areStructurallyEqual({ a: 1, nested: { b: true } }, { a: 1, nested: { b: false } })).toBe(false);
  });
});
