export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function describeValue(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return 'array';
  }
  if (value instanceof RegExp) {
    return 'regexp';
  }
  return typeof value;
}

export function deepFreeze<T>(value: T): T {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null || Object.isFrozen(value)) {
    return value;
  }

  Object.freeze(value);
  for (const key of Reflect.ownKeys(value)) {
    deepFreeze((value as Record<PropertyKey, unknown>)[key]);
  }
  return value;
}
