import type {
  ArrayItemDefinition,
  FieldDefinition,
  FieldDefinitions,
  InlineObjectDefinition,
  StateDefinitionInput,
} from './types/index.js';
import { failValidation } from './errors.js';
import { describeValue, isPlainObject } from './utils.js';

export function validateDefaultsAgainstSchema(definition: StateDefinitionInput<FieldDefinitions>): void {
  validateObjectAgainstFields(definition.defaults, definition.fields, 'defaults', definition.strict);

  const state = definition.defaults as Record<string, unknown>;
  for (const [fieldName, fieldDefinition] of Object.entries(definition.fields)) {
    evaluateStateConstraints(fieldName, fieldDefinition, state);
  }
}

function validateObjectAgainstFields(
  value: unknown,
  fields: FieldDefinitions,
  path: string,
  strict: boolean,
): void {
  if (!isPlainObject(value)) {
    failValidation(`${path} must be a plain object`);
  }

  for (const fieldName of Object.keys(fields)) {
    if (!(fieldName in value)) {
      failValidation(`${path} is missing required field "${fieldName}"`);
    }
  }

  if (strict) {
    for (const key of Object.keys(value)) {
      if (!(key in fields)) {
        failValidation(`${path} contains unknown field "${key}"`);
      }
    }
  }

  for (const [fieldName, fieldDefinition] of Object.entries(fields)) {
    validateValueAgainstField(
      (value as Record<string, unknown>)[fieldName],
      fieldDefinition,
      `${path}.${fieldName}`,
    );
  }
}

function validateValueAgainstField(value: unknown, fieldDefinition: FieldDefinition, path: string): void {
  switch (fieldDefinition.type) {
    case 'string':
      if (typeof value !== 'string') {
        failValidation(`${path} must be a string, received ${describeValue(value)}`);
      }
      return;
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        failValidation(`${path} must be a finite number, received ${describeValue(value)}`);
      }
      return;
    case 'boolean':
      if (typeof value !== 'boolean') {
        failValidation(`${path} must be a boolean, received ${describeValue(value)}`);
      }
      return;
    case 'enum':
      if (typeof value !== 'string') {
        failValidation(`${path} must be a string enum value, received ${describeValue(value)}`);
      }
      if (!fieldDefinition.values.includes(value)) {
        failValidation(`${path} must be one of [${fieldDefinition.values.join(', ')}]`);
      }
      return;
    case 'array':
      if (!Array.isArray(value)) {
        failValidation(`${path} must be an array, received ${describeValue(value)}`);
      }
      value.forEach((item, index) => {
        validateArrayItem(item, fieldDefinition.items, `${path}[${index}]`);
      });
      return;
  }
}

function validateArrayItem(value: unknown, itemDefinition: ArrayItemDefinition, path: string): void {
  if (itemDefinition.type === 'object_inline') {
    validateInlineObjectValue(value, itemDefinition, path);
    return;
  }

  validateValueAgainstField(value, itemDefinition, path);
}

function validateInlineObjectValue(value: unknown, definition: InlineObjectDefinition, path: string): void {
  validateObjectAgainstFields(value, definition.fields, path, true);
}

function evaluateStateConstraints(
  fieldName: string,
  fieldDefinition: FieldDefinition,
  state: Record<string, unknown>,
): void {
  const value = state[fieldName];
  for (const constraint of fieldDefinition.constraints ?? []) {
    if (constraint.phase !== 'state') {
      continue;
    }

    switch (constraint.kind) {
      case 'required_if':
        if (constraint.payload.predicate(state) && value === undefined) {
          failValidation(`defaults.${fieldName} is required by state constraint "${constraint.kind}"`);
        }
        break;
      case 'time_to_live':
        if (constraint.payload.fromField !== undefined && !(constraint.payload.fromField in state)) {
          failValidation(
            `defaults.${fieldName} references missing ttl source field "${constraint.payload.fromField}"`,
          );
        }
        break;
    }
  }
}
