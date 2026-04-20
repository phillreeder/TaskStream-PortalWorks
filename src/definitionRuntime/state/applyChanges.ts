import { isValidatedStateDefinition } from './defineState.js';
import { failChangeValidation } from './errors.js';
import type {
  ArrayFieldDefinition,
  ArrayItemDefinition,
  ArrayOperation,
  ArrayOperationForItems,
  DefaultsFromFields,
  FieldDefinition,
  FieldDefinitions,
  FieldValueFromDefinition,
  InlineObjectDefinition,
  StateChanges,
  StateDefinition,
} from './types/index.js';
import { isPlainObject } from './utils.js';

type MutableState<TFields extends FieldDefinitions> = DefaultsFromFields<TFields> & Record<string, unknown>;

export function applyChanges<TFields extends FieldDefinitions>(
  definition: StateDefinition<TFields>,
  previousState: Record<string, unknown>,
  stateChanges: StateChanges<TFields>,
): MutableState<TFields> {
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
  const nextState: Record<string, unknown> = { ...previousState };

  for (const fieldName of Object.keys(fields)) {
    if (!(fieldName in previousState)) {
      continue;
    }

    nextState[fieldName] = cloneValueForDefinition(fields[fieldName], previousState[fieldName]);
  }

  for (const fieldName of Object.keys(changes).sort()) {
    const fieldDefinition = fields[fieldName];
    if (fieldDefinition === undefined) {
      if (definition.strict) {
        failChangeValidation(
          'UNKNOWN_FIELD',
          `stateChanges.${fieldName}`,
          `stateChanges.${fieldName} is not declared in definition.fields`,
        );
      }
      continue;
    }

    nextState[fieldName] = applyFieldChange(
      fieldDefinition,
      previousState[fieldName],
      changes[fieldName],
      `stateChanges.${fieldName}`,
    );
  }

  return nextState as MutableState<TFields>;
}

export function applyFieldChange(
  fieldDefinition: FieldDefinition,
  previousValue: unknown,
  change: unknown,
  path = 'stateChanges.field',
): unknown {
  if (fieldDefinition.type === 'array') {
    return applyArrayOperation(
      fieldDefinition,
      previousValue,
      change as ArrayOperationForItems<ArrayItemDefinition>,
      path,
    );
  }

  return cloneValueForDefinition(fieldDefinition, change);
}

export function applyArrayOperation<TItems extends ArrayItemDefinition>(
  fieldDefinition: ArrayFieldDefinition<TItems>,
  previousValue: unknown,
  operation: ArrayOperationForItems<TItems>,
  path = 'stateChanges.field',
): readonly FieldValueFromDefinition<TItems>[] {
  if (!Array.isArray(previousValue)) {
    failChangeValidation(
      'INVALID_PREVIOUS_STATE',
      path,
      `${path} requires previousState to contain an array value for this field`,
    );
  }

  const currentItems = previousValue.map((item) => cloneValueForDefinition(fieldDefinition.items, item));

  switch (operation.op) {
    case 'replace':
      return applyReplace(fieldDefinition, operation.payload);
    case 'set_index':
      return applySetIndex(fieldDefinition, currentItems, operation.payload.index, operation.payload.value);
    case 'append':
      return applyAppend(fieldDefinition, currentItems, operation.payload.value);
    case 'remove_index':
      return applyRemoveIndex(currentItems, operation.payload.index);
    case 'pop':
      return applyPop(currentItems);
    case 'shift':
      return applyShift(currentItems);
  }
}

export function applyReplace<TItems extends ArrayItemDefinition>(
  fieldDefinition: ArrayFieldDefinition<TItems>,
  payload: readonly FieldValueFromDefinition<TItems>[],
): readonly FieldValueFromDefinition<TItems>[] {
  return payload.map((item) => cloneValueForDefinition(fieldDefinition.items, item));
}

export function applySetIndex<TItems extends ArrayItemDefinition>(
  fieldDefinition: ArrayFieldDefinition<TItems>,
  previousValue: readonly FieldValueFromDefinition<TItems>[],
  index: number,
  value: FieldValueFromDefinition<TItems>,
): readonly FieldValueFromDefinition<TItems>[] {
  const nextValue = [...previousValue];
  nextValue[index] = cloneValueForDefinition(fieldDefinition.items, value);
  return nextValue;
}

export function applyAppend<TItems extends ArrayItemDefinition>(
  fieldDefinition: ArrayFieldDefinition<TItems>,
  previousValue: readonly FieldValueFromDefinition<TItems>[],
  value: FieldValueFromDefinition<TItems>,
): readonly FieldValueFromDefinition<TItems>[] {
  return [...previousValue, cloneValueForDefinition(fieldDefinition.items, value)];
}

export function applyRemoveIndex<TValue>(previousValue: readonly TValue[], index: number): readonly TValue[] {
  return previousValue.filter((_, itemIndex) => itemIndex !== index);
}

export function applyPop<TValue>(previousValue: readonly TValue[]): readonly TValue[] {
  return previousValue.slice(0, Math.max(previousValue.length - 1, 0));
}

export function applyShift<TValue>(previousValue: readonly TValue[]): readonly TValue[] {
  return previousValue.slice(1);
}

function cloneValueForDefinition<TDefinition extends FieldDefinition | InlineObjectDefinition>(
  definition: TDefinition,
  value: unknown,
): FieldValueFromDefinition<TDefinition> {
  if (definition.type === 'array') {
    const items = Array.isArray(value) ? value : [];
    return items.map((item) => cloneValueForDefinition(definition.items, item)) as unknown as FieldValueFromDefinition<TDefinition>;
  }

  if (definition.type === 'object_inline') {
    const objectValue = isPlainObject(value) ? value : {};
    const nextObject: Record<string, unknown> = {};
    for (const fieldName of Object.keys(definition.fields)) {
      nextObject[fieldName] = cloneValueForDefinition(definition.fields[fieldName], objectValue[fieldName]);
    }
    return nextObject as FieldValueFromDefinition<TDefinition>;
  }

  return value as FieldValueFromDefinition<TDefinition>;
}
