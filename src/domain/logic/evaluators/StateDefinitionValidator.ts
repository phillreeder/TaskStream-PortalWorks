import { StateChangeValidationError, validateState as validateDefinitionState } from '../../../definitionRuntime/state/index.js';
import type { StateDefinition } from '../../../definitionRuntime/state/index.js';

export interface StateValidationOptions {
  readonly phase?: 'pre' | 'post';
}

export interface StateValidationResult {
  readonly valid: boolean;
  readonly errors?: readonly string[];
}

export function validateState(
  state: Record<string, unknown>,
  definition: StateDefinition,
  _options: StateValidationOptions = {},
): StateValidationResult {
  try {
    validateDefinitionState(definition, state);
    return { valid: true };
  } catch (error) {
    if (error instanceof StateChangeValidationError || error instanceof Error) {
      return { valid: false, errors: [error.message] };
    }
    return { valid: false, errors: ['State validation failed with an unknown error'] };
  }
}
