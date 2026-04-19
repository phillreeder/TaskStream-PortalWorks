export { defineState, isValidatedStateDefinition } from './defineState.js';
export { StateChangeValidationError, StateDefinitionValidationError } from './errors.js';
export type { StateChangeValidationErrorCode } from './errors.js';
export { validateAllowedKeys } from './validateAllowedKeys.js';
export {
  validateArrayOperation,
  validateArrayOperationPayload,
  validateChanges,
  validateIntroducedArrayValues,
  validatePrimitiveChange,
} from './validateChanges.js';
export { validateConstraintDefinition } from './validateConstraintDefinition.js';
export { validateDefaultsAgainstSchema } from './validateDefaultsAgainstSchema.js';
export { validateDefinitionStructure } from './validateDefinitionStructure.js';
export { validateFieldDefinition } from './validateFieldDefinition.js';
export type {
  ArrayOperation,
  ArrayOperationKind,
  ArrayFieldDefinition,
  ArrayItemDefinition,
  BooleanFieldDefinition,
  Constraint,
  ConstraintPhase,
  DefaultsFromFields,
  EnumFieldDefinition,
  FieldDefinition,
  FieldDefinitions,
  FieldChangeFromDefinition,
  InlineObjectDefinition,
  NumberFieldDefinition,
  StateChanges,
  StateDefinition,
  StateDefinitionInput,
  StringFieldDefinition,
} from './types/index.js';
