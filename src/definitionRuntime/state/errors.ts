export class StateDefinitionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StateDefinitionValidationError';
  }
}

export function failValidation(message: string): never {
  throw new StateDefinitionValidationError(message);
}
