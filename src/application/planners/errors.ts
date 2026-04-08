export type RunPlannerErrorCode =
  | 'STREAM_STATE_NOT_FOUND'
  | 'TENANT_PROCESS_NOT_FOUND'
  | 'TENANT_PROCESS_MISMATCH'
  | 'STATE_INVALID'
  | 'NO_ELIGIBLE_STO';

export class RunPlannerError extends Error {
  constructor(message: string, public readonly code: RunPlannerErrorCode, options?: ErrorOptions) {
    super(message, options);
    this.name = 'RunPlannerError';
  }
}
