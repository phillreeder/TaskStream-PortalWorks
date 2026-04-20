import { applyChanges } from './applyChanges.js';
import type { DefaultsFromFields, FieldDefinitions, StateChanges, StateDefinition } from './types/index.js';
import { validateChanges } from './validateChanges.js';
import { validateState } from './validateState.js';

export function validateAndApply<TFields extends FieldDefinitions>(
  definition: StateDefinition<TFields>,
  previousState: Record<string, unknown>,
  stateChanges: StateChanges<TFields>,
): DefaultsFromFields<TFields> & Record<string, unknown> {
  const validatedChanges = validateChanges(definition, previousState, stateChanges);
  const nextState = applyChanges(definition, previousState, validatedChanges);
  return validateState(definition, nextState) as DefaultsFromFields<TFields> & Record<string, unknown>;
}
