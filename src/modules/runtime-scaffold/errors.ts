export type RuntimeScaffoldLoadErrorCode =
  | 'CONTROL_FILE_READ_FAILED'
  | 'CONTROL_FILE_PARSE_FAILED'
  | 'CONTROL_FILE_INVALID'
  | 'EXECUTION_PATH_INVALID'
  | 'EXECUTION_FORMAT_UNSUPPORTED'
  | 'EXECUTION_FILE_READ_FAILED'
  | 'EXECUTION_FILE_PARSE_FAILED'
  | 'DESCRIPTOR_INVALID';

export type RuntimeScaffoldLoadErrorPhase = 'control' | 'execution' | 'normalization';

export class RuntimeScaffoldLoadError extends Error {
  readonly code: RuntimeScaffoldLoadErrorCode;
  readonly phase: RuntimeScaffoldLoadErrorPhase;
  readonly path?: string;

  constructor(input: {
    readonly message: string;
    readonly code: RuntimeScaffoldLoadErrorCode;
    readonly phase: RuntimeScaffoldLoadErrorPhase;
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

export type RuntimeScaffoldExecutionErrorCode =
  | 'EXECUTION_MODE_UNSUPPORTED'
  | 'TENANT_PROCESS_NOT_FOUND'
  | 'TENANT_PROCESS_LOAD_FAILED'
  | 'TENANT_PROCESS_INVALID'
  | 'TASK_NOT_FOUND'
  | 'TASK_BINDING_INVALID'
  | 'SOURCE_STATE_NOT_FOUND'
  | 'SOURCE_STATE_LOAD_FAILED'
  | 'SOURCE_STATE_INVALID'
  | 'FLOW_NOT_FOUND'
  | 'FLOW_BINDING_INVALID'
  | 'FLOW_EXECUTION_FAILED'
  | 'RESULT_WRITE_FAILED';

export type RuntimeScaffoldExecutionErrorPhase =
  | 'descriptor-loading'
  | 'mode'
  | 'tenant-process'
  | 'task-resolution'
  | 'source-state'
  | 'state-preparation'
  | 'flow-resolution'
  | 'flow-execution'
  | 'result-writing';

export class RuntimeScaffoldExecutionError extends Error {
  readonly code: RuntimeScaffoldExecutionErrorCode;
  readonly phase: RuntimeScaffoldExecutionErrorPhase;
  readonly path?: string;
  readonly details?: unknown;

  constructor(input: {
    readonly message: string;
    readonly code: RuntimeScaffoldExecutionErrorCode;
    readonly phase: RuntimeScaffoldExecutionErrorPhase;
    readonly path?: string;
    readonly details?: unknown;
    readonly cause?: unknown;
  }) {
    super(input.message, { cause: input.cause });
    this.name = 'RuntimeScaffoldExecutionError';
    this.code = input.code;
    this.phase = input.phase;
    this.path = input.path;
    this.details = input.details;
  }
}
