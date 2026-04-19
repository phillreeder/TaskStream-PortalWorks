import type {
  Constraint,
  MaxConstraint,
  MinConstraint,
  RegexConstraint,
  RequiredIfConstraint,
  TtlConstraint,
} from './constraints.js';

export interface BaseFieldDefinition<TConstraint extends Constraint> {
  type: string;
  metadata?: Record<string, unknown>;
  constraints?: readonly TConstraint[];
}

export interface StringFieldDefinition extends BaseFieldDefinition<RegexConstraint | RequiredIfConstraint | TtlConstraint> {
  type: 'string';
}

export interface NumberFieldDefinition extends BaseFieldDefinition<MinConstraint | MaxConstraint | RequiredIfConstraint | TtlConstraint> {
  type: 'number';
}

export interface BooleanFieldDefinition extends BaseFieldDefinition<RequiredIfConstraint | TtlConstraint> {
  type: 'boolean';
}

export type EnumValues = readonly [string, ...string[]];

export interface EnumFieldDefinition<TValues extends EnumValues = EnumValues>
  extends BaseFieldDefinition<RequiredIfConstraint | TtlConstraint> {
  type: 'enum';
  values: TValues;
}

export interface InlineObjectDefinition<TFields extends FieldDefinitions = FieldDefinitions> {
  type: 'object_inline';
  fields: TFields;
}

export type ArrayItemDefinition = FieldDefinition | InlineObjectDefinition;

export interface ArrayFieldDefinition<TItems extends ArrayItemDefinition = ArrayItemDefinition>
  extends BaseFieldDefinition<RequiredIfConstraint | TtlConstraint> {
  type: 'array';
  items: TItems;
}

export type FieldDefinition =
  | StringFieldDefinition
  | NumberFieldDefinition
  | BooleanFieldDefinition
  | EnumFieldDefinition
  | ArrayFieldDefinition;

export type FieldDefinitions = Record<string, FieldDefinition>;

export type FieldValueFromDefinition<TDefinition extends FieldDefinition | InlineObjectDefinition> =
  TDefinition extends StringFieldDefinition
    ? string
    : TDefinition extends NumberFieldDefinition
      ? number
      : TDefinition extends BooleanFieldDefinition
        ? boolean
        : TDefinition extends EnumFieldDefinition<infer TValues>
          ? TValues[number]
          : TDefinition extends ArrayFieldDefinition<infer TItems>
            ? readonly FieldValueFromDefinition<TItems>[]
            : TDefinition extends InlineObjectDefinition<infer TFields>
              ? { [TKey in keyof TFields]: FieldValueFromDefinition<TFields[TKey]> }
              : never;

export type DefaultsFromFields<TFields extends FieldDefinitions> = {
  [TKey in keyof TFields]: FieldValueFromDefinition<TFields[TKey]>;
};
