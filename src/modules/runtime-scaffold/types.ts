export type JsonPrimitive = string | number | boolean | null;
export type JsonObject = { readonly [key: string]: JsonValue };
export type JsonArray = readonly JsonValue[];
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;

export type RuntimeScaffoldExecutionMode = 'flowOnly' | 'channelFlow' | 'flatTask';
export type RuntimeScaffoldRefKind = 'file' | 'module' | 'fixture';
export type RuntimeScaffoldStateRefKind = 'file' | 'inline' | 'fixture';
export type RuntimeScaffoldRunFileFormat = 'json';

export interface ScaffoldControlFile {
  readonly activeExecutionFile: string;
}

export interface RuntimeScaffoldReference {
  readonly kind: RuntimeScaffoldRefKind;
  readonly ref: string;
}

export type RuntimeScaffoldStateReference =
  | {
      readonly kind: 'inline';
      readonly value: JsonValue;
    }
  | {
      readonly kind: Exclude<RuntimeScaffoldStateRefKind, 'inline'>;
      readonly ref: string;
    };

export interface RuntimeScaffoldExecutionTarget {
  readonly flowId?: string;
  readonly channelId?: string;
  readonly stoId?: string;
  readonly taskId?: string;
  readonly input?: JsonValue;
}


export interface RuntimeScaffoldWebOptions {
  readonly provider: 'playwright';
  readonly session: {
    readonly sessionRef: string;
    readonly providerId: string;
    readonly tenantRef?: string;
    readonly accountRef?: string;
    readonly strategy: 'persistent-profile';
    readonly profileDir: string;
  };
  readonly browser?: {
    readonly maximumBrowserInstances?: number;
    readonly headless?: boolean;
    readonly launchOptions?: JsonObject;
    readonly contextOptions?: JsonObject;
    readonly persistentContextOptions?: JsonObject;
  };
}

export interface RuntimeScaffoldOutputOptions {
  readonly outputDir?: string;
  readonly writeTrace?: boolean;
  readonly writeResult?: boolean;
  readonly writeNextState?: boolean;
}

export interface RuntimeScaffoldDescriptor {
  readonly id: string;
  readonly mode: RuntimeScaffoldExecutionMode;
  readonly tenantProcessRef: RuntimeScaffoldReference;
  readonly taskId: string;
  readonly sourceStateRef: RuntimeScaffoldStateReference;
  readonly execution?: RuntimeScaffoldExecutionTarget;
  readonly output?: RuntimeScaffoldOutputOptions;
  readonly mocks?: JsonObject;
  readonly web?: RuntimeScaffoldWebOptions;
}

export interface RuntimeScaffoldFileSystem {
  readTextFile(filePath: string): Promise<string>;
}

export interface RuntimeScaffoldTraceRecordCall {
  readonly operationKey: string;
  readonly data?: JsonValue;
  readonly context?: JsonValue;
  readonly phase?: 'START' | 'END' | 'POINT' | 'ERROR';
  readonly severity?: 'debug' | 'info' | 'warn' | 'error';
  readonly status?: 'ok' | 'error' | 'rejected';
  readonly message?: string;
  readonly metadata?: {
    readonly operation?: string;
    readonly topic?: string;
    readonly area?: string;
    readonly rubric?: string;
    readonly tags?: readonly string[];
  };
}

export interface RuntimeScaffoldSystemTraceTracer {
  record(call: RuntimeScaffoldTraceRecordCall): Promise<unknown>;
}

export interface RuntimeScaffoldLoadSuccess {
  readonly ok: true;
  readonly controlPath: string;
  readonly executionPath: string;
  readonly executionFormat: RuntimeScaffoldRunFileFormat;
  readonly descriptorId: string;
  readonly descriptor: RuntimeScaffoldDescriptor;
  readonly warnings: readonly string[];
}

export interface RuntimeScaffoldLoadFailure {
  readonly ok: false;
  readonly controlPath?: string;
  readonly executionPath?: string;
  readonly error: import('./errors.js').RuntimeScaffoldLoadError;
}

export type RuntimeScaffoldLoadResult = RuntimeScaffoldLoadSuccess | RuntimeScaffoldLoadFailure;

export interface RuntimeScaffoldValidationSummary {
  readonly valid: boolean;
  readonly target: 'tenantProcess' | 'sourceState' | 'proposedState';
  readonly notes?: readonly string[];
}

export interface RuntimeScaffoldArtifactRefs {
  readonly resultArtifactRef?: string;
  readonly traceRef?: string;
  readonly proposedStateArtifactRef?: string;
}

export interface RuntimeScaffoldExecutionSuccess extends RuntimeScaffoldArtifactRefs {
  readonly ok: true;
  readonly status: 'succeeded';
  readonly controlPath?: string;
  readonly executionPath?: string;
  readonly executionFormat?: RuntimeScaffoldRunFileFormat;
  readonly descriptorId: string;
  readonly descriptor: RuntimeScaffoldDescriptor;
  readonly mode: RuntimeScaffoldExecutionMode;
  readonly tenantProcessId?: string;
  readonly taskId: string;
  readonly selectedStoId: string;
  readonly selectedFlowId: string;
  readonly previousState: unknown;
  readonly proposedState: unknown;
  readonly validation: RuntimeScaffoldValidationSummary;
  readonly flowResult: unknown;
  readonly warnings: readonly string[];
}

export interface RuntimeScaffoldExecutionFailure extends RuntimeScaffoldArtifactRefs {
  readonly ok: false;
  readonly status: 'failed';
  readonly controlPath?: string;
  readonly executionPath?: string;
  readonly executionFormat?: RuntimeScaffoldRunFileFormat;
  readonly descriptorId?: string;
  readonly descriptor?: RuntimeScaffoldDescriptor;
  readonly mode?: RuntimeScaffoldExecutionMode;
  readonly tenantProcessId?: string;
  readonly taskId?: string;
  readonly selectedStoId?: string;
  readonly selectedFlowId?: string;
  readonly previousState?: unknown;
  readonly proposedState?: unknown;
  readonly validation?: RuntimeScaffoldValidationSummary;
  readonly errorPhase: import('./errors.js').RuntimeScaffoldExecutionErrorPhase;
  readonly error: import('./errors.js').RuntimeScaffoldExecutionError | import('./errors.js').RuntimeScaffoldLoadError;
  readonly warnings: readonly string[];
}

export type RuntimeScaffoldExecutionResult = RuntimeScaffoldExecutionSuccess | RuntimeScaffoldExecutionFailure;
