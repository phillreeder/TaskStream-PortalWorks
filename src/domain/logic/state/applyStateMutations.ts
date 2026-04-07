import type { StateMutation } from '../../contracts/stateWriter.ts';
import type { StateChange } from '../../entities/execution.ts';

export interface ProjectedStateChanges {
  readonly nextState: Record<string, unknown>;
  readonly appliedChanges: readonly StateChange[];
}

export class StateMutationApplicationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StateMutationApplicationError';
  }
}

type PlainObject = Record<string, unknown>;

const isObject = (value: unknown): value is PlainObject => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const cloneValue = <T>(value: T): T => {
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
};

const splitPath = (path: string): string[] => path.split('.').filter(Boolean);

const ensureContainer = (root: PlainObject, segments: string[]): PlainObject => {
  let current: PlainObject = root;
  for (const segment of segments) {
    const existing = current[segment];
    if (!isObject(existing)) {
      current[segment] = {};
    }
    current = current[segment] as PlainObject;
  }
  return current;
};

const setByPath = (root: PlainObject, path: string, value: unknown): void => {
  const segments = splitPath(path);
  if (segments.length === 0) {
    throw new StateMutationApplicationError('State path must not be empty');
  }
  const finalKey = segments.pop()!;
  const container = ensureContainer(root, segments);
  container[finalKey] = cloneValue(value);
};

const readPath = (root: PlainObject, path: string): unknown => {
  const segments = splitPath(path);
  let current: unknown = root;
  for (const segment of segments) {
    if (!isObject(current) && !Array.isArray(current)) {
      return undefined;
    }
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (Number.isNaN(index) || index < 0 || index >= current.length) {
        return undefined;
      }
      current = current[index];
    } else {
      current = (current as PlainObject)[segment];
    }
    if (current === undefined) {
      return undefined;
    }
  }
  return current;
};

const removeByPath = (root: PlainObject, path: string): void => {
  const segments = splitPath(path);
  if (segments.length === 0) {
    throw new StateMutationApplicationError('State path must not be empty');
  }
  const finalKey = segments.pop()!;
  let current: PlainObject | undefined = root;
  for (const segment of segments) {
    const next = current?.[segment];
    if (!isObject(next)) {
      return;
    }
    current = next;
  }
  if (current) {
    delete current[finalKey];
  }
};

const mergeByPath = (root: PlainObject, path: string, value: Record<string, unknown>): void => {
  let target = readPath(root, path);
  if (target === undefined) {
    setByPath(root, path, {});
    target = readPath(root, path);
  }
  if (!isObject(target)) {
    throw new StateMutationApplicationError(`Cannot merge into non-object path ${path}`);
  }
  Object.assign(target, cloneValue(value));
};

export const projectStateChanges = (
  state: Record<string, unknown>,
  mutations: readonly StateMutation[],
): ProjectedStateChanges => {
  const nextState = cloneValue(state);
  const appliedChanges: StateChange[] = [];

  for (const mutation of mutations) {
    switch (mutation.type) {
      case 'set':
        setByPath(nextState, mutation.path, mutation.value);
        appliedChanges.push({ key: mutation.path, value: cloneValue(mutation.value) });
        break;
      case 'merge':
        mergeByPath(nextState, mutation.path, mutation.value);
        appliedChanges.push({ key: mutation.path, value: cloneValue(readPath(nextState, mutation.path)) });
        break;
      case 'remove':
        removeByPath(nextState, mutation.path);
        appliedChanges.push({ key: mutation.path, value: undefined });
        break;
      default:
        throw new StateMutationApplicationError(`Unsupported mutation type ${(mutation as { type: string }).type}`);
    }
  }

  return { nextState, appliedChanges };
};
