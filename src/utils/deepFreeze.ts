const FREEZABLE_TYPES = new Set(['[object Object]', '[object Array]', '[object Map]', '[object Set]']);

const typeOf = (value: unknown): string => Object.prototype.toString.call(value);

export function deepFreeze<T>(value: T, seen: WeakSet<object> = new WeakSet()): T {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value !== 'object') {
    return value;
  }

  const typedValue = value as Record<string, unknown>;
  if (seen.has(typedValue)) {
    return value;
  }
  seen.add(typedValue);

  const tag = typeOf(value);
  if (!FREEZABLE_TYPES.has(tag)) {
    return value;
  }

  if (tag === '[object Map]') {
    for (const [key, entry] of (value as Map<unknown, unknown>).entries()) {
      deepFreeze(key as object, seen);
      deepFreeze(entry as object, seen);
    }
  } else if (tag === '[object Set]') {
    for (const entry of (value as Set<unknown>).values()) {
      deepFreeze(entry as object, seen);
    }
  } else {
    for (const key of Object.keys(typedValue)) {
      const child = typedValue[key];
      if (child && typeof child === 'object') {
        deepFreeze(child, seen);
      }
    }
  }

  Object.freeze(value);
  return value;
}
