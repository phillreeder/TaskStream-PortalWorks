import type { JsonArray, JsonObject, JsonValue } from './types.js';

const REDACTED = '[REDACTED]';
const MAX_DEPTH = 8;
const unsafeKeyPattern = /(password|passwd|pwd|token|secret|credential|authorization|api[-_]?key|rawpayload|raw[-_]?payload)/i;

export function sanitizeTraceValue(value: unknown): JsonValue {
  return sanitizeValue(value, 0, new WeakSet<object>());
}

function sanitizeValue(value: unknown, depth: number, seen: WeakSet<object>): JsonValue {
  if (depth > MAX_DEPTH) {
    return '[MaxDepth]';
  }

  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return Number.isNaN(value) ? null : value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (typeof value === 'undefined' || typeof value === 'function' || typeof value === 'symbol') {
    return String(value);
  }

  if (typeof value !== 'object') {
    return String(value);
  }

  if (seen.has(value)) {
    return '[Circular]';
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeValue(entry, depth + 1, seen)) as JsonArray;
  }

  const objectValue = value as Record<string, unknown>;
  const sanitized: Record<string, JsonValue> = {};
  for (const [key, entry] of Object.entries(objectValue)) {
    sanitized[key] = unsafeKeyPattern.test(key) ? REDACTED : sanitizeValue(entry, depth + 1, seen);
  }
  return sanitized as JsonObject;
}
