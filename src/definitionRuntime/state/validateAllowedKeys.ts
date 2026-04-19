import { failValidation } from './errors.js';
import { isPlainObject } from './utils.js';

export function validateAllowedKeys(
  value: unknown,
  allowedKeys: readonly string[],
  path: string,
): asserts value is Record<string, unknown> {
  if (!isPlainObject(value)) {
    failValidation(`${path} must be a plain object`);
  }

  for (const key of Object.keys(value)) {
    if (!allowedKeys.includes(key)) {
      failValidation(`${path} contains unknown key "${key}"`);
    }
  }
}
