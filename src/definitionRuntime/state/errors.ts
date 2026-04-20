export class StateDefinitionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StateDefinitionValidationError';
  }
}

export function failValidation(message: string): never {
  throw new StateDefinitionValidationError(message);
}

export type StateChangeValidationErrorCode =
  | 'UNVALIDATED_DEFINITION'
  | 'INVALID_PREVIOUS_STATE'
  | 'INVALID_STATE_CHANGES'
  | 'INVALID_NEXT_STATE'
  | 'UNKNOWN_FIELD'
  | 'INVALID_FIELD_VALUE'
  | 'CHANGE_CONSTRAINT_VIOLATION'
  | 'STATE_CONSTRAINT_VIOLATION'
  | 'INVALID_ARRAY_OPERATION'
  | 'INVALID_ARRAY_PAYLOAD'
  | 'ARRAY_INDEX_OUT_OF_BOUNDS'
  | 'ARRAY_OPERATION_NOT_ALLOWED';

export class StateChangeValidationError extends Error {
  constructor(
    message: string,
    public readonly code: StateChangeValidationErrorCode,
    public readonly path: string,
  ) {
    super(message);
    this.name = 'StateChangeValidationError';
  }
}

export function failChangeValidation(
  code: StateChangeValidationErrorCode,
  path: string,
  message: string,
): never {
  throw new StateChangeValidationError(message, code, path);
}
