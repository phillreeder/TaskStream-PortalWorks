export type TenantProcessValidationErrorCode =
  | 'INVALID_ROOT'
  | 'INVALID_REQUIRED_FIELD'
  | 'INVALID_REGISTRY'
  | 'REGISTRY_ID_MISMATCH'
  | 'MISSING_REFERENCE'
  | 'INVALID_REFERENCE'
  | 'INVALID_STATE_DEFINITION'
  | 'INVALID_BINDING';

export class TenantProcessValidationError extends Error {
  constructor(
    message: string,
    public readonly code: TenantProcessValidationErrorCode,
    public readonly path: string,
  ) {
    super(message);
    this.name = 'TenantProcessValidationError';
  }
}

export function failTenantProcessValidation(
  code: TenantProcessValidationErrorCode,
  path: string,
  message: string,
): never {
  throw new TenantProcessValidationError(message, code, path);
}
