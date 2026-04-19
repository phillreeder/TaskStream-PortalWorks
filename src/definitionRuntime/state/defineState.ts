import { VALIDATED_STATE_DEFINITION } from './types/brand.js';
import type { FieldDefinitions, StateDefinition, StateDefinitionInput } from './types/index.js';
import { deepFreeze } from './utils.js';
import { validateDefaultsAgainstSchema } from './validateDefaultsAgainstSchema.js';
import { validateDefinitionStructure } from './validateDefinitionStructure.js';

export function defineState<TState extends Record<string, unknown>>() {
  return function defineTypedState<const TFields extends FieldDefinitions>(
    definition: StateDefinitionInput<TFields> & { defaults: TState },
  ): StateDefinition<TFields> {
    validateDefinitionStructure(definition);
    validateDefaultsAgainstSchema(definition);

    Object.defineProperty(definition, VALIDATED_STATE_DEFINITION, {
      value: true,
      enumerable: false,
      configurable: false,
      writable: false,
    });

    return deepFreeze(definition) as unknown as StateDefinition<TFields>;
  };
}

export function isValidatedStateDefinition(value: unknown): value is StateDefinition<FieldDefinitions> {
  return (
    (typeof value === 'object' || typeof value === 'function') &&
    value !== null &&
    VALIDATED_STATE_DEFINITION in value &&
    (value as Record<PropertyKey, unknown>)[VALIDATED_STATE_DEFINITION] === true
  );
}
