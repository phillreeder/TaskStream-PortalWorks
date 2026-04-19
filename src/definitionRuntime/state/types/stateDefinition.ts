import type { ValidatedStateDefinitionBrand } from './brand.js';
import type { DefaultsFromFields, FieldDefinitions } from './fields.js';

export interface StateDefinitionInput<TFields extends FieldDefinitions = FieldDefinitions> {
  id: string;
  version: number;
  strict: boolean;
  defaults: DefaultsFromFields<TFields>;
  fields: TFields;
}

export type StateDefinition<TFields extends FieldDefinitions = FieldDefinitions> = Readonly<StateDefinitionInput<TFields>> &
  ValidatedStateDefinitionBrand;
