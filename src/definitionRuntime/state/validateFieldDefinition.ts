import type { FieldDefinition, InlineObjectDefinition } from './types/index.js';
import { failValidation } from './errors.js';
import { validateAllowedKeys } from './validateAllowedKeys.js';
import { validateConstraintDefinition } from './validateConstraintDefinition.js';
import { isPlainObject } from './utils.js';

export function validateFieldDefinition(
  path: string,
  fieldDefinition: unknown,
  options: { allowInlineObject?: boolean } = {},
): void {
  validateAllowedKeys(
    fieldDefinition,
    resolveAllowedKeys(fieldDefinition, options.allowInlineObject ?? false),
    path,
  );

  const type = fieldDefinition.type;
  if (
    type !== 'string' &&
    type !== 'number' &&
    type !== 'boolean' &&
    type !== 'enum' &&
    type !== 'array' &&
    type !== 'object_inline'
  ) {
    failValidation(`${path}.type must be a supported field type`);
  }

  if (fieldDefinition.metadata !== undefined && !isPlainObject(fieldDefinition.metadata)) {
    failValidation(`${path}.metadata must be a plain object when provided`);
  }

  if (type === 'object_inline') {
    if (!options.allowInlineObject) {
      failValidation(`${path}.type "object_inline" is only allowed inside array items`);
    }
    validateInlineObjectDefinition(path, fieldDefinition as unknown as InlineObjectDefinition);
    return;
  }

  const field = fieldDefinition as unknown as FieldDefinition;

  if (type === 'enum') {
    const enumField = field as Extract<FieldDefinition, { type: 'enum' }>;
    const values = enumField.values;
    if (!Array.isArray(values) || values.length === 0) {
      failValidation(`${path}.values must be a non-empty array for enum fields`);
    }
    const seen = new Set<string>();
    for (const value of values) {
      if (typeof value !== 'string' || value.length === 0) {
        failValidation(`${path}.values entries must be non-empty strings`);
      }
      if (seen.has(value)) {
        failValidation(`${path}.values must not contain duplicates`);
      }
      seen.add(value);
    }
  }

  if (type === 'array') {
    const arrayField = field as Extract<FieldDefinition, { type: 'array' }>;
    if (arrayField.items === undefined) {
      failValidation(`${path}.items is required for array fields`);
    }
    validateFieldDefinition(`${path}.items`, arrayField.items, { allowInlineObject: true });
  }

  if (field.constraints !== undefined) {
    if (!Array.isArray(field.constraints)) {
      failValidation(`${path}.constraints must be an array when provided`);
    }
    field.constraints.forEach((constraint, index) => {
      validateConstraintDefinition(`${path}.constraints[${index}]`, constraint, field);
    });
  }
}

function validateInlineObjectDefinition(path: string, definition: InlineObjectDefinition): void {
  const candidate = definition as unknown as Record<string, unknown>;
  validateAllowedKeys(candidate, ['type', 'fields'], path);
  if (!isPlainObject(candidate.fields)) {
    failValidation(`${path}.fields must be a plain object`);
  }
  for (const [fieldName, fieldDefinition] of Object.entries(candidate.fields)) {
    validateFieldDefinition(`${path}.fields.${fieldName}`, fieldDefinition);
  }
}

function resolveAllowedKeys(fieldDefinition: unknown, allowInlineObject: boolean): readonly string[] {
  if (!isPlainObject(fieldDefinition) || typeof fieldDefinition.type !== 'string') {
    return ['type', 'metadata', 'constraints', 'values', 'items', 'fields'];
  }

  switch (fieldDefinition.type) {
    case 'enum':
      return ['type', 'values', 'metadata', 'constraints'];
    case 'array':
      return ['type', 'items', 'metadata', 'constraints'];
    case 'object_inline':
      return allowInlineObject ? ['type', 'fields'] : ['type'];
    default:
      return ['type', 'metadata', 'constraints'];
  }
}
