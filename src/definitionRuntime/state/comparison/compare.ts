import { isPlainObject } from '../utils.js';
import type { ComparisonResult, StateDiff } from './types.js';

export function compare(
  prevState: Record<string, unknown>,
  nextState: Record<string, unknown>,
): ComparisonResult {
  const diff = createDiff(prevState, nextState);

  if (isEmptyDiff(diff)) {
    return { equal: true };
  }

  return {
    equal: false,
    diff,
  };
}

export function createDiff(prevState: Record<string, unknown>, nextState: Record<string, unknown>): StateDiff {
  const added: Record<string, unknown> = {};
  const removed: Record<string, unknown> = {};
  const changed: StateDiff['changed'] = {};

  for (const key of getSortedUnionKeys(prevState, nextState)) {
    const hasPreviousValue = Object.prototype.hasOwnProperty.call(prevState, key);
    const hasNextValue = Object.prototype.hasOwnProperty.call(nextState, key);

    if (!hasPreviousValue && hasNextValue) {
      added[key] = nextState[key];
      continue;
    }

    if (hasPreviousValue && !hasNextValue) {
      removed[key] = prevState[key];
      continue;
    }

    if (!areStructurallyEqual(prevState[key], nextState[key])) {
      changed[key] = {
        prev: prevState[key],
        next: nextState[key],
      };
    }
  }

  return {
    added,
    removed,
    changed,
  };
}

export function areStructurallyEqual(prevValue: unknown, nextValue: unknown): boolean {
  if (Object.is(prevValue, nextValue)) {
    return true;
  }

  if (Array.isArray(prevValue) || Array.isArray(nextValue)) {
    return compareArrays(prevValue, nextValue);
  }

  if (isPlainObject(prevValue) || isPlainObject(nextValue)) {
    return compareObjects(prevValue, nextValue);
  }

  return false;
}

function compareArrays(prevValue: unknown, nextValue: unknown): boolean {
  if (!Array.isArray(prevValue) || !Array.isArray(nextValue)) {
    return false;
  }

  if (prevValue.length !== nextValue.length) {
    return false;
  }

  for (let index = 0; index < prevValue.length; index += 1) {
    if (!areStructurallyEqual(prevValue[index], nextValue[index])) {
      return false;
    }
  }

  return true;
}

function compareObjects(prevValue: unknown, nextValue: unknown): boolean {
  if (!isPlainObject(prevValue) || !isPlainObject(nextValue)) {
    return false;
  }

  const previousKeys = Object.keys(prevValue).sort();
  const nextKeys = Object.keys(nextValue).sort();

  if (previousKeys.length !== nextKeys.length) {
    return false;
  }

  for (let index = 0; index < previousKeys.length; index += 1) {
    const previousKey = previousKeys[index];
    const nextKey = nextKeys[index];

    if (previousKey !== nextKey) {
      return false;
    }

    if (!areStructurallyEqual(prevValue[previousKey], nextValue[nextKey])) {
      return false;
    }
  }

  return true;
}

function getSortedUnionKeys(prevState: Record<string, unknown>, nextState: Record<string, unknown>): string[] {
  return Array.from(new Set([...Object.keys(prevState), ...Object.keys(nextState)])).sort();
}

function isEmptyDiff(diff: StateDiff): boolean {
  return Object.keys(diff.added).length === 0 &&
    Object.keys(diff.removed).length === 0 &&
    Object.keys(diff.changed).length === 0;
}
