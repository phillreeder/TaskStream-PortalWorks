export type RuntimeScaffoldLoadErrorCode =
  | 'CONTROL_FILE_READ_FAILED'
  | 'CONTROL_FILE_PARSE_FAILED'
  | 'CONTROL_FILE_INVALID'
  | 'EXECUTION_PATH_INVALID'
  | 'EXECUTION_FORMAT_UNSUPPORTED'
  | 'EXECUTION_FILE_READ_FAILED'
  | 'EXECUTION_FILE_PARSE_FAILED'
  | 'DESCRIPTOR_INVALID';

export class RuntimeScaffoldLoadError extends Error {
  readonly code: RuntimeScaffoldLoadErrorCode;
  readonly phase: 'control' | 'execution' | 'normalization';
  readonly path?: string;

  constructor(input: {
    readonly message: string;
    readonly code: RuntimeScaffoldLoadErrorCode;
    readonly phase: 'control' | 'execution' | 'normalization';
    readonly path?: string;
    readonly cause?: unknown;
  }) {
    super(input.message, { cause: input.cause });
    this.name = 'RuntimeScaffoldLoadError';
    this.code = input.code;
    this.phase = input.phase;
    this.path = input.path;
  }
}
