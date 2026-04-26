export { defineState, isValidatedStateDefinition } from './defineState.js';
export { StateChangeValidationError, StateDefinitionValidationError } from './errors.js';
export type { StateChangeValidationErrorCode } from './errors.js';
export { StateContainer, StateContainerOperationError } from './StateContainer.js';
export { StateReader } from './StateReader.js';
export { StateWriter } from './StateWriter.js';
export type {
  StateContainerOperationErrorCode,
  StateContainerOperationErrorReason,
  StateContainerConstructorInput,
  StateContainerOptions,
  StateContainerValidationFailure,
  StateContainerValidationResult,
  StateContainerValidationSuccess,
  StatePath,
  StatePathInput,
  StatePathSegment,
  StatePathValueInput,
} from './StateContainer.js';
export type { StateReaderConstructorInput } from './StateReader.js';
export type { StateWriterConstructorInput } from './StateWriter.js';
export { areStructurallyEqual, compare, createDiff } from './comparison/index.js';
export {
  applyAppend,
  applyArrayOperation,
  applyChanges,
  applyFieldChange,
  applyPop,
  applyRemoveIndex,
  applyReplace,
  applySetIndex,
  applyShift,
} from './applyChanges.js';
export { validateAllowedKeys } from './validateAllowedKeys.js';
export { validateAndApply } from './validateAndApply.js';
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
export {
  evaluateConstraint,
  evaluateMaxValue,
  evaluateMinValue,
  evaluateRequiredIf,
  evaluateStateConstraints,
  evaluateTimeToLive,
  validateFieldValue,
  validateState,
} from './validateState.js';
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
  FieldValueFromDefinition,
  InlineObjectDefinition,
  NumberFieldDefinition,
  StateChanges,
  StateDefinition,
  StateDefinitionInput,
  StringFieldDefinition,
} from './types/index.js';
export type { ComparisonResult, StateDiff, StateDiffChange } from './comparison/index.js';
