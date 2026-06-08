export type StreamStateModuleErrorCode =
  | 'STREAM_STATE_NOT_FOUND'
  | 'PLANNING_CONTRACT_NOT_FOUND'
  | 'PLANNING_CONTRACT_MISMATCH'
  | 'RESERVATION_CONFLICT'
  | 'RESERVATION_NOT_FOUND'
  | 'RESERVATION_INACTIVE'
  | 'INVALID_STATE_PATH'
  | 'UNSUPPORTED_CHANGE_OPERATION';

export class StreamStateModuleError extends Error {
  constructor(message: string, public readonly code: StreamStateModuleErrorCode, options?: ErrorOptions) {
    super(message, options);
    this.name = 'StreamStateModuleError';
  }
}
