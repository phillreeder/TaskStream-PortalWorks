import { isValidatedStateDefinition } from './defineState.js';
import { failChangeValidation } from './errors.js';
import type {
  ArrayFieldDefinition,
  ArrayItemDefinition,
  ArrayOperationKind,
  FieldDefinition,
  FieldDefinitions,
  InlineObjectDefinition,
  StateChanges,
  StateDefinition,
} from './types/index.js';
import { describeValue, isPlainObject } from './utils.js';

const arrayOperationKinds = ['replace', 'set_index', 'append', 'remove_index', 'pop', 'shift'] as const;

export function validateChanges<TFields extends FieldDefinitions>(
  definition: StateDefinition<TFields>,
  previousState: Record<string, unknown>,
  stateChanges: StateChanges<TFields>,
): StateChanges<TFields> {
  if (!isValidatedStateDefinition(definition)) {
    failChangeValidation(
      'UNVALIDATED_DEFINITION',
      'definition',
      'definition must be a validated StateDefinition created by defineState()',
    );
  }

  if (!isPlainObject(previousState)) {
    failChangeValidation('INVALID_PREVIOUS_STATE', 'previousState', 'previousState must be a plain object');
  }

  if (!isPlainObject(stateChanges)) {
    failChangeValidation('INVALID_STATE_CHANGES', 'stateChanges', 'stateChanges must be a plain object');
  }

  const fields = definition.fields as Record<string, FieldDefinition>;
  const changes = stateChanges as Record<string, unknown>;

  for (const fieldName of Object.keys(changes).sort()) {
    const path = `stateChanges.${fieldName}`;
    const fieldDefinition = fields[fieldName];
    if (fieldDefinition === undefined) {
      if (definition.strict) {
        failChangeValidation('UNKNOWN_FIELD', path, `${path} is not declared in definition.fields`);
      }
      continue;
    }

    const nextValue = changes[fieldName];
    if (fieldDefinition.type === 'array') {
      validateArrayOperation(fieldDefinition, previousState[fieldName], nextValue, path);
      continue;
    }

    validatePrimitiveChange(fieldDefinition, nextValue, path);
  }

  return stateChanges;
}

export function validatePrimitiveChange(
  fieldDefinition: Exclude<FieldDefinition, ArrayFieldDefinition>,
  value: unknown,
  path: string,
): void {
  validateDeclaredValue(fieldDefinition, value, path, { allowArrayLiterals: false });
}

export function validateArrayOperation(
  fieldDefinition: ArrayFieldDefinition,
  previousValue: unknown,
  operation: unknown,
  path: string,
): void {
  if (!Array.isArray(previousValue)) {
    failChangeValidation(
      'INVALID_PREVIOUS_STATE',
      path,
      `${path} requires previousState to contain an array value for this field`,
    );
  }

  if (!isPlainObject(operation)) {
    failChangeValidation('INVALID_ARRAY_OPERATION', path, `${path} must be an explicit array operation object`);
  }

  assertKnownKeys(operation, ['op', 'payload'], path, 'INVALID_ARRAY_OPERATION');

  if (typeof operation.op !== 'string' || !isArrayOperationKind(operation.op)) {
    failChangeValidation(
      'INVALID_ARRAY_OPERATION',
      `${path}.op`,
      `${path}.op must be one of [${arrayOperationKinds.join(', ')}]`,
    );
  }

  validateArrayOperationPayload(fieldDefinition, previousValue, operation.op, operation.payload, path);
}

export function validateArrayOperationPayload(
  fieldDefinition: ArrayFieldDefinition,
  previousValue: readonly unknown[],
  operationKind: ArrayOperationKind,
  payload: unknown,
  path: string,
): void {
  const payloadPath = `${path}.payload`;

  switch (operationKind) {
    case 'replace':
      if (!Array.isArray(payload)) {
        failChangeValidation(
          'INVALID_ARRAY_PAYLOAD',
          payloadPath,
          `${payloadPath} must be an array for "replace"`,
        );
      }
      payload.forEach((value, index) => {
        validateIntroducedArrayValues(fieldDefinition.items, value, `${payloadPath}[${index}]`);
      });
      return;
    case 'set_index':
      assertPlainObjectPayload(payload, payloadPath, operationKind);
      assertKnownKeys(payload, ['index', 'value'], payloadPath, 'INVALID_ARRAY_PAYLOAD');
      assertRequiredKeys(payload, ['index', 'value'], payloadPath, operationKind);
      validateArrayIndex(payload.index, payloadPath, operationKind, previousValue.length);
      validateIntroducedArrayValues(fieldDefinition.items, payload.value, `${payloadPath}.value`);
      return;
    case 'append':
      assertPlainObjectPayload(payload, payloadPath, operationKind);
      assertKnownKeys(payload, ['value'], payloadPath, 'INVALID_ARRAY_PAYLOAD');
      assertRequiredKeys(payload, ['value'], payloadPath, operationKind);
      validateIntroducedArrayValues(fieldDefinition.items, payload.value, `${payloadPath}.value`);
      return;
    case 'remove_index':
      assertPlainObjectPayload(payload, payloadPath, operationKind);
      assertKnownKeys(payload, ['index'], payloadPath, 'INVALID_ARRAY_PAYLOAD');
      assertRequiredKeys(payload, ['index'], payloadPath, operationKind);
      validateArrayIndex(payload.index, payloadPath, operationKind, previousValue.length);
      return;
    case 'pop':
    case 'shift':
      if (payload !== undefined) {
        failChangeValidation(
          'INVALID_ARRAY_PAYLOAD',
          payloadPath,
          `${payloadPath} must be omitted for "${operationKind}"`,
        );
      }
      if (previousValue.length === 0) {
        failChangeValidation(
          'ARRAY_OPERATION_NOT_ALLOWED',
          path,
          `${path} cannot use "${operationKind}" on an empty array`,
        );
      }
      return;
  }
}

export function validateIntroducedArrayValues(
  itemDefinition: ArrayItemDefinition,
  value: unknown,
  path: string,
): void {
  validateDeclaredValue(itemDefinition, value, path, { allowArrayLiterals: true });
}

function validateDeclaredValue(
  definition: FieldDefinition | InlineObjectDefinition,
  value: unknown,
  path: string,
  options: { allowArrayLiterals: boolean },
): void {
  if (definition.type === 'object_inline') {
    validateInlineObjectValue(definition, value, path);
    return;
  }

  switch (definition.type) {
    case 'string':
      if (typeof value !== 'string') {
        failChangeValidation('INVALID_FIELD_VALUE', path, `${path} must be a string, received ${describeValue(value)}`);
      }
      validateChangeConstraints(definition, value, path);
      return;
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        failChangeValidation(
          'INVALID_FIELD_VALUE',
          path,
          `${path} must be a finite number, received ${describeValue(value)}`,
        );
      }
      validateChangeConstraints(definition, value, path);
      return;
    case 'boolean':
      if (typeof value !== 'boolean') {
        failChangeValidation('INVALID_FIELD_VALUE', path, `${path} must be a boolean, received ${describeValue(value)}`);
      }
      return;
    case 'enum':
      if (typeof value !== 'string') {
        failChangeValidation(
          'INVALID_FIELD_VALUE',
          path,
          `${path} must be a string enum value, received ${describeValue(value)}`,
        );
      }
      if (!definition.values.includes(value)) {
        failChangeValidation(
          'INVALID_FIELD_VALUE',
          path,
          `${path} must be one of [${definition.values.join(', ')}]`,
        );
      }
      return;
    case 'array':
      if (!options.allowArrayLiterals) {
        failChangeValidation(
          'INVALID_ARRAY_OPERATION',
          path,
          `${path} must use an explicit array operation instead of a raw array value`,
        );
      }
      if (!Array.isArray(value)) {
        failChangeValidation('INVALID_FIELD_VALUE', path, `${path} must be an array, received ${describeValue(value)}`);
      }
      value.forEach((item, index) => {
        validateIntroducedArrayValues(definition.items, item, `${path}[${index}]`);
      });
      return;
  }
}

function validateInlineObjectValue(definition: InlineObjectDefinition, value: unknown, path: string): void {
  if (!isPlainObject(value)) {
    failChangeValidation('INVALID_FIELD_VALUE', path, `${path} must be a plain object, received ${describeValue(value)}`);
  }

  const fields = definition.fields as Record<string, FieldDefinition>;
  for (const fieldName of Object.keys(fields).sort()) {
    if (!(fieldName in value)) {
      failChangeValidation('INVALID_FIELD_VALUE', `${path}.${fieldName}`, `${path}.${fieldName} is required`);
    }
  }

  for (const key of Object.keys(value).sort()) {
    if (!(key in fields)) {
      failChangeValidation('INVALID_FIELD_VALUE', `${path}.${key}`, `${path}.${key} is not declared in inline object fields`);
    }
  }

  for (const fieldName of Object.keys(fields).sort()) {
    validateDeclaredValue(fields[fieldName], value[fieldName], `${path}.${fieldName}`, { allowArrayLiterals: true });
  }
}

function validateChangeConstraints(
  fieldDefinition: Exclude<FieldDefinition, ArrayFieldDefinition>,
  value: string | number | boolean,
  path: string,
): void {
  for (const constraint of fieldDefinition.constraints ?? []) {
    if (constraint.phase !== 'change') {
      continue;
    }

    switch (constraint.kind) {
      case 'min_value':
        if (typeof value === 'number' && value < constraint.payload.value) {
          failChangeValidation(
            'CHANGE_CONSTRAINT_VIOLATION',
            path,
            `${path} must be greater than or equal to ${constraint.payload.value}`,
          );
        }
        continue;
      case 'max_value':
        if (typeof value === 'number' && value > constraint.payload.value) {
          failChangeValidation(
            'CHANGE_CONSTRAINT_VIOLATION',
            path,
            `${path} must be less than or equal to ${constraint.payload.value}`,
          );
        }
        continue;
      case 'matches_regex': {
        if (typeof value !== 'string') {
          continue;
        }

        const pattern = new RegExp(constraint.payload.pattern.source, constraint.payload.pattern.flags);
        if (!pattern.test(value)) {
          failChangeValidation(
            'CHANGE_CONSTRAINT_VIOLATION',
            path,
            `${path} must match ${constraint.payload.pattern.toString()}`,
          );
        }
        continue;
      }
      default:
        continue;
    }
  }
}

function validateArrayIndex(
  value: unknown,
  path: string,
  operationKind: 'set_index' | 'remove_index',
  arrayLength: number,
): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    failChangeValidation(
      'INVALID_ARRAY_PAYLOAD',
      `${path}.index`,
      `${path}.index must be a non-negative integer for "${operationKind}"`,
    );
  }

  if (value >= arrayLength) {
    failChangeValidation(
      'ARRAY_INDEX_OUT_OF_BOUNDS',
      `${path}.index`,
      `${path}.index ${value} is out of bounds for current array length ${arrayLength}`,
    );
  }
}

function assertPlainObjectPayload(
  payload: unknown,
  path: string,
  operationKind: Exclude<ArrayOperationKind, 'replace' | 'pop' | 'shift'>,
): asserts payload is Record<string, unknown> {
  if (!isPlainObject(payload)) {
    failChangeValidation(
      'INVALID_ARRAY_PAYLOAD',
      path,
      `${path} must be a plain object for "${operationKind}", received ${describeValue(payload)}`,
    );
  }
}

function assertKnownKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
  path: string,
  code: 'INVALID_ARRAY_OPERATION' | 'INVALID_ARRAY_PAYLOAD',
): void {
  for (const key of Object.keys(value).sort()) {
    if (!allowedKeys.includes(key)) {
      failChangeValidation(code, `${path}.${key}`, `${path} contains unknown key "${key}"`);
    }
  }
}

function assertRequiredKeys(
  value: Record<string, unknown>,
  requiredKeys: readonly string[],
  path: string,
  operationKind: Exclude<ArrayOperationKind, 'replace' | 'pop' | 'shift'>,
): void {
  for (const key of [...requiredKeys].sort()) {
    if (!(key in value)) {
      failChangeValidation(
        'INVALID_ARRAY_PAYLOAD',
        `${path}.${key}`,
        `${path}.${key} is required for "${operationKind}"`,
      );
    }
  }
}

function isArrayOperationKind(value: string): value is ArrayOperationKind {
  return (arrayOperationKinds as readonly string[]).includes(value);
}
