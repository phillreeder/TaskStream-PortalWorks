import { isValidatedStateDefinition } from './defineState.js';
import { failChangeValidation } from './errors.js';
import type {
  Constraint,
  FieldDefinition,
  FieldDefinitions,
  InlineObjectDefinition,
  StateDefinition,
} from './types/index.js';
import { describeValue, isPlainObject } from './utils.js';

export function validateState<TFields extends FieldDefinitions>(
  definition: StateDefinition<TFields>,
  nextState: Record<string, unknown>,
): Record<string, unknown> {
  if (!isValidatedStateDefinition(definition)) {
    failChangeValidation(
      'UNVALIDATED_DEFINITION',
      'definition',
      'definition must be a validated StateDefinition created by defineState()',
    );
  }

  validateObjectAgainstFields(
    definition.fields as Record<string, FieldDefinition>,
    nextState,
    'nextState',
    definition.strict,
    nextState,
  );

  return nextState;
}

export function validateFieldValue(
  fieldDefinition: FieldDefinition | InlineObjectDefinition,
  value: unknown,
  path: string,
  rootState: Record<string, unknown>,
): void {
  if (fieldDefinition.type === 'object_inline') {
    if (!isPlainObject(value)) {
      failChangeValidation('INVALID_NEXT_STATE', path, `${path} must be a plain object, received ${describeValue(value)}`);
    }

    validateObjectAgainstFields(
      fieldDefinition.fields as Record<string, FieldDefinition>,
      value,
      path,
      true,
      rootState,
    );
    return;
  }

  switch (fieldDefinition.type) {
    case 'string':
      if (typeof value !== 'string') {
        failChangeValidation('INVALID_NEXT_STATE', path, `${path} must be a string, received ${describeValue(value)}`);
      }
      break;
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        failChangeValidation(
          'INVALID_NEXT_STATE',
          path,
          `${path} must be a finite number, received ${describeValue(value)}`,
        );
      }
      break;
    case 'boolean':
      if (typeof value !== 'boolean') {
        failChangeValidation('INVALID_NEXT_STATE', path, `${path} must be a boolean, received ${describeValue(value)}`);
      }
      break;
    case 'enum':
      if (typeof value !== 'string') {
        failChangeValidation(
          'INVALID_NEXT_STATE',
          path,
          `${path} must be a string enum value, received ${describeValue(value)}`,
        );
      }
      if (!fieldDefinition.values.includes(value)) {
        failChangeValidation('INVALID_NEXT_STATE', path, `${path} must be one of [${fieldDefinition.values.join(', ')}]`);
      }
      break;
    case 'array':
      if (!Array.isArray(value)) {
        failChangeValidation('INVALID_NEXT_STATE', path, `${path} must be an array, received ${describeValue(value)}`);
      }

      value.forEach((item, index) => {
        validateFieldValue(fieldDefinition.items, item, `${path}[${index}]`, rootState);
      });
      break;
  }

  evaluateStateConstraints(fieldDefinition, value, rootState, path);
}

export function evaluateStateConstraints(
  fieldDefinition: FieldDefinition,
  value: unknown,
  state: Record<string, unknown>,
  path: string,
): void {
  for (const constraint of fieldDefinition.constraints ?? []) {
    if (constraint.phase !== 'state') {
      continue;
    }

    evaluateConstraint(constraint, value, state, path);
  }
}

export function evaluateConstraint(
  constraint: Constraint,
  value: unknown,
  state: Record<string, unknown>,
  path: string,
): void {
  switch (constraint.kind) {
    case 'min_value':
      evaluateMinValue(value, constraint.payload.value, path);
      return;
    case 'max_value':
      evaluateMaxValue(value, constraint.payload.value, path);
      return;
    case 'required_if':
      evaluateRequiredIf(value, constraint.payload.predicate, state, path);
      return;
    case 'time_to_live':
      evaluateTimeToLive(value, constraint.payload.ms, constraint.payload.fromField, state, path);
      return;
    case 'matches_regex':
      return;
  }
}

export function evaluateMinValue(value: unknown, minimum: number, path: string): void {
  if (typeof value === 'number' && value < minimum) {
    failChangeValidation(
      'STATE_CONSTRAINT_VIOLATION',
      path,
      `${path} must be greater than or equal to ${minimum}`,
    );
  }
}

export function evaluateMaxValue(value: unknown, maximum: number, path: string): void {
  if (typeof value === 'number' && value > maximum) {
    failChangeValidation(
      'STATE_CONSTRAINT_VIOLATION',
      path,
      `${path} must be less than or equal to ${maximum}`,
    );
  }
}

export function evaluateRequiredIf(
  value: unknown,
  predicate: (state: Record<string, unknown>) => boolean,
  state: Record<string, unknown>,
  path: string,
): void {
  let required = false;

  try {
    required = predicate(state);
  } catch (error) {
    const reason = error instanceof Error ? error.message : describeValue(error);
    failChangeValidation(
      'STATE_CONSTRAINT_VIOLATION',
      path,
      `${path} could not evaluate required_if predicate: ${reason}`,
    );
  }

  if (required && !hasRequiredValue(value)) {
    failChangeValidation(
      'STATE_CONSTRAINT_VIOLATION',
      path,
      `${path} is required by state constraint "required_if"`,
    );
  }
}

function hasRequiredValue(value: unknown): boolean {
  if (value === undefined || value === null) {
    return false;
  }

  if (typeof value === 'string') {
    return value.trim().length > 0;
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  return true;
}

export function evaluateTimeToLive(
  value: unknown,
  ms: number,
  fromField: string | undefined,
  state: Record<string, unknown>,
  path: string,
): void {
  const sourcePath = fromField === undefined ? path : `nextState.${fromField}`;
  const sourceValue = fromField === undefined ? value : state[fromField];

  if (sourceValue === undefined) {
    failChangeValidation(
      'STATE_CONSTRAINT_VIOLATION',
      path,
      `${path} references missing ttl source field "${fromField}"`,
    );
  }

  if (typeof sourceValue !== 'number' || !Number.isFinite(sourceValue)) {
    failChangeValidation(
      'STATE_CONSTRAINT_VIOLATION',
      sourcePath,
      `${sourcePath} must be a finite number to evaluate "time_to_live"`,
    );
  }

  if (Date.now() - sourceValue > ms) {
    failChangeValidation(
      'STATE_CONSTRAINT_VIOLATION',
      path,
      `${path} exceeded time_to_live of ${ms}ms`,
    );
  }
}

function validateObjectAgainstFields(
  fields: Record<string, FieldDefinition>,
  candidate: unknown,
  path: string,
  strict: boolean,
  rootState: Record<string, unknown>,
): void {
  if (!isPlainObject(candidate)) {
    failChangeValidation('INVALID_NEXT_STATE', path, `${path} must be a plain object, received ${describeValue(candidate)}`);
  }

  for (const fieldName of Object.keys(fields).sort()) {
    if (!(fieldName in candidate)) {
      failChangeValidation('INVALID_NEXT_STATE', `${path}.${fieldName}`, `${path}.${fieldName} is required`);
    }
  }

  if (strict) {
    for (const key of Object.keys(candidate).sort()) {
      if (!(key in fields)) {
        failChangeValidation('UNKNOWN_FIELD', `${path}.${key}`, `${path}.${key} is not declared in definition.fields`);
      }
    }
  }

  for (const fieldName of Object.keys(fields).sort()) {
    validateFieldValue(fields[fieldName], candidate[fieldName], `${path}.${fieldName}`, rootState);
  }
}
