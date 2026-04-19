import type { FieldDefinitions, StateDefinitionInput } from './types/index.js';
import { failValidation } from './errors.js';
import { validateAllowedKeys } from './validateAllowedKeys.js';
import { validateFieldDefinition } from './validateFieldDefinition.js';
import { isPlainObject } from './utils.js';

export function validateDefinitionStructure(definition: unknown): asserts definition is StateDefinitionInput<FieldDefinitions> {
  validateAllowedKeys(definition, ['id', 'version', 'strict', 'defaults', 'fields'], 'state definition');
  const candidate = definition as Record<string, unknown>;

  if (!('id' in candidate)) {
    failValidation('state definition is missing required key "id"');
  }
  if (!('version' in candidate)) {
    failValidation('state definition is missing required key "version"');
  }
  if (!('strict' in candidate)) {
    failValidation('state definition is missing required key "strict"');
  }
  if (!('defaults' in candidate)) {
    failValidation('state definition is missing required key "defaults"');
  }
  if (!('fields' in candidate)) {
    failValidation('state definition is missing required key "fields"');
  }

  if (typeof candidate.id !== 'string' || candidate.id.trim().length === 0) {
    failValidation('state definition id must be a non-empty string');
  }
  if (typeof candidate.version !== 'number' || !Number.isInteger(candidate.version) || candidate.version < 1) {
    failValidation('state definition version must be a positive integer');
  }
  if (typeof candidate.strict !== 'boolean') {
    failValidation('state definition strict must be a boolean');
  }
  if (!isPlainObject(candidate.defaults)) {
    failValidation('state definition defaults must be a plain object');
  }
  if (!isPlainObject(candidate.fields)) {
    failValidation('state definition fields must be a plain object');
  }

  for (const [fieldName, fieldDefinition] of Object.entries(candidate.fields)) {
    if (fieldName.trim().length === 0) {
      failValidation('state definition field names must be non-empty strings');
    }
    validateFieldDefinition(`fields.${fieldName}`, fieldDefinition);
  }
}
