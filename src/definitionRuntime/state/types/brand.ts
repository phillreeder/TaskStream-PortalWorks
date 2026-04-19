export const VALIDATED_STATE_DEFINITION = Symbol('taskstream.validatedStateDefinition');

export type ValidatedStateDefinitionBrand = {
  readonly [VALIDATED_STATE_DEFINITION]: true;
};
