import type { ArrayFieldDefinition, ArrayItemDefinition, FieldDefinition, FieldDefinitions, FieldValueFromDefinition } from './fields.js';

export type ArrayOperationKind = 'replace' | 'set_index' | 'append' | 'remove_index' | 'pop' | 'shift';

export interface ReplaceArrayOperation<TValue> {
  op: 'replace';
  payload: readonly TValue[];
}

export interface SetIndexArrayOperation<TValue> {
  op: 'set_index';
  payload: {
    index: number;
    value: TValue;
  };
}

export interface AppendArrayOperation<TValue> {
  op: 'append';
  payload: {
    value: TValue;
  };
}

export interface RemoveIndexArrayOperation {
  op: 'remove_index';
  payload: {
    index: number;
  };
}

export interface PopArrayOperation {
  op: 'pop';
}

export interface ShiftArrayOperation {
  op: 'shift';
}

export type ArrayOperation<TValue> =
  | ReplaceArrayOperation<TValue>
  | SetIndexArrayOperation<TValue>
  | AppendArrayOperation<TValue>
  | RemoveIndexArrayOperation
  | PopArrayOperation
  | ShiftArrayOperation;

export type FieldChangeFromDefinition<TDefinition extends FieldDefinition> =
  TDefinition extends ArrayFieldDefinition<infer TItems>
    ? ArrayOperation<FieldValueFromDefinition<TItems>>
    : FieldValueFromDefinition<TDefinition>;

export type StateChanges<TFields extends FieldDefinitions = FieldDefinitions> = Partial<{
  [TKey in keyof TFields]: FieldChangeFromDefinition<TFields[TKey]>;
}>;

export type ArrayOperationForItems<TItems extends ArrayItemDefinition> = ArrayOperation<FieldValueFromDefinition<TItems>>;
