import { describe, expect, it, vi } from 'vitest';
import { StateChangeValidationError, StateContainer, StateReader, StateWriter, defineState } from '../index.js';

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
    id: 'taskstream.test.state-facades',
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

describe('StateReader and StateWriter', () => {
  it('bind to the same container so writes are immediately visible to reads', () => {
    const container = createContainer();
    const reader = new StateReader({ container });
    const writer = new StateWriter({ container });

    expect(reader.get({ path: ['name'] })).toBe('alpha');

    writer.set_path({ path: ['name'], value: 'beta' });
    writer.append_path({ path: ['items'], value: { code: 'B', count: 2 } });

    expect(reader.get({ path: ['name'] })).toBe('beta');
    expect(reader.get({ path: ['items'] })).toEqual([
      { code: 'A', count: 1 },
      { code: 'B', count: 2 },
    ]);
  });

  it('returns safe read values without caching across mutations', () => {
    const container = createContainer();
    const reader = new StateReader({ container });
    const writer = new StateWriter({ container });

    const firstRead = reader.get({ path: ['items'] }) as RuntimeState['items'];
    expect(Object.isFrozen(firstRead)).toBe(true);
    expect(Object.isFrozen(firstRead[0])).toBe(true);

    writer.set_path({ path: ['items', 0, 'count'], value: 2 });

    const secondRead = reader.get({ path: ['items'] }) as RuntimeState['items'];
    expect(secondRead).toEqual([{ code: 'A', count: 2 }]);
    expect(firstRead).toEqual([{ code: 'A', count: 1 }]);
    expect(firstRead).not.toBe(secondRead);
    expect(firstRead[0]).not.toBe(secondRead[0]);
  });

  it('keeps StateReader read-only at runtime', () => {
    const reader = new StateReader({ container: createContainer() });

    expect('set_path' in reader).toBe(false);
    expect('set_paths' in reader).toBe(false);
    expect('append_path' in reader).toBe(false);
    expect('remove_path' in reader).toBe(false);
    expect('pop_path' in reader).toBe(false);
    expect('shift_path' in reader).toBe(false);
  });

  it('passes reader inputs directly to StateContainer.read_path', () => {
    const container = createContainer();
    const reader = new StateReader({ container });
    const input = { path: ['items', 0] };
    const readSpy = vi.spyOn(container, 'read_path');

    expect(reader.get(input)).toEqual({ code: 'A', count: 1 });
    expect(readSpy).toHaveBeenCalledOnce();
    expect(readSpy.mock.calls[0]?.[0]).toBe(input);
  });

  it('passes writer operations directly through to the StateContainer', () => {
    const container = createContainer();
    const writer = new StateWriter({ container });
    const options = { validateOnly: true };
    const setInput = { path: ['name'], value: 'beta' };
    const setPathsInput = [{ path: ['name'], value: 'beta' }];
    const appendInput = { path: ['tags'], value: 'c' };
    const removeInput = { path: ['tags', 0] };
    const popInput = { path: ['tags'] };
    const shiftInput = { path: ['tags'] };

    const setSpy = vi.spyOn(container, 'set_path');
    const setPathsSpy = vi.spyOn(container, 'set_paths');
    const appendSpy = vi.spyOn(container, 'append_path');
    const removeSpy = vi.spyOn(container, 'remove_path');
    const popSpy = vi.spyOn(container, 'pop_path');
    const shiftSpy = vi.spyOn(container, 'shift_path');

    expect(writer.set_path(setInput, options)).toEqual({ valid: true });
    expect(writer.set_paths(setPathsInput, options)).toEqual({ valid: true });
    expect(writer.append_path(appendInput, options)).toEqual({ valid: true });
    expect(writer.remove_path(removeInput, options)).toEqual({ valid: true });
    expect(writer.pop_path(popInput, options)).toEqual({ valid: true });
    expect(writer.shift_path(shiftInput, options)).toEqual({ valid: true });

    expect(setSpy.mock.calls[0]).toEqual([setInput, options]);
    expect(setSpy.mock.calls[0]?.[0]).toBe(setInput);
    expect(setSpy.mock.calls[0]?.[1]).toBe(options);
    expect(setPathsSpy.mock.calls[0]).toEqual([setPathsInput, options]);
    expect(setPathsSpy.mock.calls[0]?.[0]).toBe(setPathsInput);
    expect(appendSpy.mock.calls[0]).toEqual([appendInput, options]);
    expect(removeSpy.mock.calls[0]).toEqual([removeInput, options]);
    expect(popSpy.mock.calls[0]).toEqual([popInput, options]);
    expect(shiftSpy.mock.calls[0]).toEqual([shiftInput, options]);
    expect(container.snapshot()).toEqual(createState());
  });

  it('preserves StateContainer validation behavior and errors through StateWriter', () => {
    const container = createContainer();
    const writer = new StateWriter({ container });

    const result = writer.set_path({ path: ['status'], value: 'running' }, { validateOnly: true });
    expect(result?.valid).toBe(false);
    if (result?.valid === false) {
      expect(result.error.operation).toBe('set_path');
      expect(result.error.path).toEqual(['status']);
      expect(result.error.cause).toBeInstanceOf(StateChangeValidationError);
    }

    expect(() => writer.set_path({ path: ['status'], value: 'running' })).toThrowError(
      /set_path failed validation/,
    );
    expect(container.snapshot()).toEqual(createState());
  });
});
