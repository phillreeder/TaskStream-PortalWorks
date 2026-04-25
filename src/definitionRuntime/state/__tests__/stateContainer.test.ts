import { describe, expect, it } from 'vitest';
import {
  StateChangeValidationError,
  StateContainer,
  StateContainerOperationError,
  defineState,
} from '../index.js';

type RuntimeState = {
  name: string;
  attempts: number;
  status: 'pending' | 'running' | 'done';
  note: string;
  tags: string[];
  items: { code: string; count: number }[];
};

function createDefinition() {
  return defineState<RuntimeState>()({
    id: 'taskstream.test.state-container',
    version: 1,
    strict: true,
    defaults: createState(),
    fields: {
      name: {
        type: 'string',
        constraints: [{ kind: 'matches_regex', phase: 'change', payload: { pattern: /^[a-z]+$/ } }],
      },
      attempts: {
        type: 'number',
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
    },
  });
}

function createState(): RuntimeState {
  return {
    name: 'alpha',
    attempts: 1,
    status: 'pending',
    note: '',
    tags: ['a', 'b'],
    items: [{ code: 'A', count: 1 }],
  };
}

function createContainer(state: RuntimeState = createState()) {
  return new StateContainer({ definition: createDefinition(), state });
}

function expectContainerError(
  callback: () => unknown,
  expected: {
    code: string;
    operation: string;
    path: readonly (string | number)[];
    reason: string;
  },
): StateContainerOperationError {
  try {
    callback();
    throw new Error('Expected a StateContainerOperationError');
  } catch (error) {
    expect(error).toBeInstanceOf(StateContainerOperationError);
    const typedError = error as StateContainerOperationError;
    expect(typedError.code).toBe(expected.code);
    expect(typedError.operation).toBe(expected.operation);
    expect(typedError.path).toEqual(expected.path);
    expect(typedError.reason).toBe(expected.reason);
    return typedError;
  }
}

describe('StateContainer', () => {
  it('uses definition defaults by default and rejects invalid constructor inputs', () => {
    const definition = createDefinition();
    const container = new StateContainer({ definition });

    expect(container.snapshot()).toEqual(createState());

    expect(() =>
      new StateContainer({
        definition,
        state: {
          ...createState(),
          status: 'running',
        } as RuntimeState,
      }),
    ).toThrowError(StateChangeValidationError);

    expectContainerError(
      () =>
        new StateContainer({
          definition: {
            id: 'invalid',
            version: 1,
            strict: true,
            defaults: createState(),
            fields: createDefinition().fields,
          } as never,
        }),
      {
        code: 'INVALID_DEFINITION',
        operation: 'constructor',
        path: [],
        reason: 'definition_invalid',
      },
    );
  });

  it('mutates through path operations without exposing mutable state references', () => {
    const container = createContainer();
    const appendedItem = { code: 'B', count: 2 };

    container.set_path({ path: ['name'], value: 'beta' });
    container.set_path({ path: ['items', 0, 'count'], value: 2 });
    container.append_path({ path: ['items'], value: appendedItem });
    container.append_path({ path: ['tags'], value: 'c' });
    container.remove_path({ path: ['tags', 0] });
    container.pop_path({ path: ['tags'] });
    container.append_path({ path: ['tags'], value: 'd' });
    container.shift_path({ path: ['tags'] });

    expect(container.snapshot()).toEqual({
      ...createState(),
      name: 'beta',
      items: [
        { code: 'A', count: 2 },
        { code: 'B', count: 2 },
      ],
      tags: ['d'],
    });

    appendedItem.count = 99;
    expect(container.read_path({ path: ['items', 1, 'count'] })).toBe(2);

    const item = container.read_path({ path: ['items', 0] });
    expect(item).toEqual({ code: 'A', count: 2 });
    expect(Object.isFrozen(item)).toBe(true);

    const snapshot = container.snapshot();
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.items)).toBe(true);
    expect(Object.isFrozen(snapshot.items[0])).toBe(true);

    const firstRead = container.read_path({ path: ['items'] }) as RuntimeState['items'];
    const secondRead = container.read_path({ path: ['items'] }) as RuntimeState['items'];
    expect(firstRead).not.toBe(secondRead);
    expect(firstRead[0]).not.toBe(secondRead[0]);

    const secondSnapshot = container.snapshot();
    expect(snapshot).not.toBe(secondSnapshot);
    expect(snapshot.items).not.toBe(secondSnapshot.items);
  });

  it('supports validateOnly without mutation and uses the same validation boundary as execution', () => {
    const container = createContainer();

    const validResult = container.set_path({ path: ['name'], value: 'beta' }, { validateOnly: true });
    expect(validResult).toEqual({ valid: true });
    expect(container.read_path({ path: ['name'] })).toBe('alpha');

    const invalidResult = container.set_path({ path: ['status'], value: 'running' }, { validateOnly: true });
    expect(invalidResult?.valid).toBe(false);
    if (invalidResult?.valid === false) {
      expect(invalidResult.error.code).toBe('CONSTRAINT_VIOLATION');
      expect(invalidResult.error.operation).toBe('set_path');
      expect(invalidResult.error.path).toEqual(['status']);
      expect(invalidResult.error.cause).toBeInstanceOf(StateChangeValidationError);
    }
    expect(container.snapshot()).toEqual(createState());

    const thrownError = expectContainerError(
      () => container.set_path({ path: ['status'], value: 'running' }),
      {
        code: 'CONSTRAINT_VIOLATION',
        operation: 'set_path',
        path: ['status'],
        reason: 'constraint_violation',
      },
    );
    expect(thrownError.cause).toBeInstanceOf(StateChangeValidationError);
    expect(container.snapshot()).toEqual(createState());

    const invalidPathResult = container.set_path({ path: ['tags', 99], value: 'z' }, { validateOnly: true });
    expect(invalidPathResult?.valid).toBe(false);
    if (invalidPathResult?.valid === false) {
      expect(invalidPathResult.error.code).toBe('INDEX_OUT_OF_BOUNDS');
      expect(invalidPathResult.error.path).toEqual(['tags', 99]);
    }

    const duplicatePathResult = container.set_paths(
      [
        { path: ['name'], value: 'beta' },
        { path: ['name'], value: 'gamma' },
      ],
      { validateOnly: true },
    );
    expect(duplicatePathResult?.valid).toBe(false);
    if (duplicatePathResult?.valid === false) {
      expect(duplicatePathResult.error.code).toBe('DUPLICATE_PATH');
      expect(duplicatePathResult.error.path).toEqual(['name']);
    }
  });

  it('applies set_paths atomically and independently of input order', () => {
    const first = createContainer();
    const second = createContainer();

    first.set_paths([
      { path: ['status'], value: 'running' },
      { path: ['note'], value: 'ready' },
      { path: ['items', 0, 'count'], value: 3 },
    ]);
    second.set_paths([
      { path: ['items', 0, 'count'], value: 3 },
      { path: ['note'], value: 'ready' },
      { path: ['status'], value: 'running' },
    ]);

    expect(first.snapshot()).toEqual(second.snapshot());
    expect(first.snapshot()).toEqual({
      ...createState(),
      status: 'running',
      note: 'ready',
      items: [{ code: 'A', count: 3 }],
    });

    const container = createContainer();
    const result = container.set_paths(
      [
        { path: ['name'], value: 'beta' },
        { path: ['status'], value: 'running' },
      ],
      { validateOnly: true },
    );

    expect(result?.valid).toBe(false);
    expect(container.snapshot()).toEqual(createState());
    expectContainerError(
      () =>
        container.set_paths([
          { path: ['name'], value: 'beta' },
          { path: ['status'], value: 'running' },
        ]),
      {
        code: 'CONSTRAINT_VIOLATION',
        operation: 'set_paths',
        path: [],
        reason: 'constraint_violation',
      },
    );
    expect(container.snapshot()).toEqual(createState());
  });

  it('rejects duplicate and overlapping set_paths before mutation', () => {
    const container = createContainer();

    expectContainerError(
      () =>
        container.set_paths([
          { path: ['name'], value: 'beta' },
          { path: ['name'], value: 'gamma' },
        ]),
      {
        code: 'DUPLICATE_PATH',
        operation: 'set_paths',
        path: ['name'],
        reason: 'duplicate_path',
      },
    );

    expectContainerError(
      () =>
        container.set_paths([
          { path: ['items'], value: [{ code: 'B', count: 2 }] },
          { path: ['items', 0, 'code'], value: 'C' },
        ]),
      {
        code: 'OVERLAPPING_PATH',
        operation: 'set_paths',
        path: ['items', 0, 'code'],
        reason: 'overlapping_path',
      },
    );

    expect(container.snapshot()).toEqual(createState());
  });

  it('rejects malformed paths and malformed set_paths inputs deterministically', () => {
    const container = createContainer();

    expectContainerError(() => container.set_path({ path: 'name' as never, value: 'beta' }), {
      code: 'INVALID_PATH',
      operation: 'set_path',
      path: [],
      reason: 'path_invalid',
    });

    expectContainerError(() => container.set_path({ path: [] as never, value: 'beta' }), {
      code: 'INVALID_PATH',
      operation: 'set_path',
      path: [],
      reason: 'path_invalid',
    });

    expectContainerError(() => container.set_path({ path: [''] as never, value: 'beta' }), {
      code: 'INVALID_PATH',
      operation: 'set_path',
      path: [''],
      reason: 'path_invalid',
    });

    expectContainerError(() => container.set_path({ path: ['tags', -1] as never, value: 'beta' }), {
      code: 'INVALID_PATH',
      operation: 'set_path',
      path: ['tags', -1],
      reason: 'path_invalid',
    });

    expectContainerError(() => container.set_path({ path: ['tags', 1.5] as never, value: 'beta' }), {
      code: 'INVALID_PATH',
      operation: 'set_path',
      path: ['tags', 1.5],
      reason: 'path_invalid',
    });

    expectContainerError(() => container.set_paths('bad-input' as never), {
      code: 'INVALID_OPERATION_INPUT',
      operation: 'set_paths',
      path: [],
      reason: 'operation_input_invalid',
    });

    expectContainerError(() => container.set_paths(['bad-entry'] as never), {
      code: 'INVALID_OPERATION_INPUT',
      operation: 'set_paths',
      path: [],
      reason: 'operation_input_invalid',
    });
  });

  it('enforces deterministic path constraints', () => {
    const container = createContainer();

    expectContainerError(() => container.set_path({ path: ['missing'], value: true }), {
      code: 'TARGET_NOT_FOUND',
      operation: 'set_path',
      path: ['missing'],
      reason: 'target_not_found',
    });

    expectContainerError(() => container.set_path({ path: ['tags', 99], value: 'z' }), {
      code: 'INDEX_OUT_OF_BOUNDS',
      operation: 'set_path',
      path: ['tags', 99],
      reason: 'index_out_of_bounds',
    });

    expectContainerError(() => container.set_path({ path: ['name', 'first'], value: 'x' }), {
      code: 'TYPE_MISMATCH',
      operation: 'set_path',
      path: ['name', 'first'],
      reason: 'type_mismatch',
    });

    expectContainerError(() => container.append_path({ path: ['name'], value: 'x' }), {
      code: 'TYPE_MISMATCH',
      operation: 'append_path',
      path: ['name'],
      reason: 'type_mismatch',
    });

    expectContainerError(() => createContainer({ ...createState(), tags: [] }).pop_path({ path: ['tags'] }), {
      code: 'ARRAY_OPERATION_NOT_ALLOWED',
      operation: 'pop_path',
      path: ['tags'],
      reason: 'array_operation_not_allowed',
    });
  });

  it('rejects object-key removal when it would invalidate state and preserves state on failure', () => {
    const container = createContainer();
    const before = container.snapshot();

    const error = expectContainerError(() => container.remove_path({ path: ['items', 0, 'code'] }), {
      code: 'VALUE_INVALID',
      operation: 'remove_path',
      path: ['items', 0, 'code'],
      reason: 'value_invalid',
    });

    expect(error.cause).toBeInstanceOf(StateChangeValidationError);
    expect(container.snapshot()).toEqual(before);
  });

  it('creates independent clones that share validation behavior', () => {
    const container = createContainer();
    const cloned = container.clone();

    cloned.set_path({ path: ['name'], value: 'beta' });

    expect(container.read_path({ path: ['name'] })).toBe('alpha');
    expect(cloned.read_path({ path: ['name'] })).toBe('beta');
    expectContainerError(() => cloned.set_path({ path: ['status'], value: 'running' }), {
      code: 'CONSTRAINT_VIOLATION',
      operation: 'set_path',
      path: ['status'],
      reason: 'constraint_violation',
    });
  });
});
