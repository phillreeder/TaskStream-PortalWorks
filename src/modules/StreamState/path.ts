import type { JsonObject, JsonValue, StatePath } from './types.js';
import { StreamStateModuleError } from './errors.js';

export function pathKey(path: StatePath): string {
  assertValidPath(path);
  return path.map(String).join('.');
}

export function pathsOverlap(left: StatePath, right: StatePath): boolean {
  const max = Math.min(left.length, right.length);
  for (let index = 0; index < max; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

export function applySet(source: JsonObject, path: StatePath, value: JsonValue): JsonObject {
  assertValidPath(path);
  const clone = cloneJsonObject(source);
  setAtPath(clone, path, value);
  return clone;
}

export function applyUnset(source: JsonObject, path: StatePath): JsonObject {
  assertValidPath(path);
  const clone = cloneJsonObject(source);
  unsetAtPath(clone, path);
  return clone;
}

export function cloneJsonObject(value: JsonObject): JsonObject {
  return JSON.parse(JSON.stringify(value)) as JsonObject;
}

function assertValidPath(path: StatePath): void {
  if (path.length === 0) {
    throw new StreamStateModuleError('State path must contain at least one segment', 'INVALID_STATE_PATH');
  }
}

function setAtPath(target: Record<string, unknown>, path: StatePath, value: JsonValue): void {
  let cursor: Record<string, unknown> = target;
  for (let index = 0; index < path.length - 1; index += 1) {
    const segment = path[index];
    const key = String(segment);
    const existing = cursor[key];
    if (!isRecord(existing)) {
      cursor[key] = {};
    }
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[String(path[path.length - 1])] = value;
}

function unsetAtPath(target: Record<string, unknown>, path: StatePath): void {
  let cursor: Record<string, unknown> = target;
  for (let index = 0; index < path.length - 1; index += 1) {
    const segment = path[index];
    const existing = cursor[String(segment)];
    if (!isRecord(existing)) {
      return;
    }
    cursor = existing;
  }
  delete cursor[String(path[path.length - 1])];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
