export type JsonPrimitive = string | number | boolean | null;
export type JsonObject = { readonly [key: string]: JsonValue };
export type JsonArray = readonly JsonValue[];
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;

export type RuntimeScaffoldExecutionMode = 'flowOnly' | 'channelFlow';
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
}

export interface RuntimeScaffoldFileSystem {
  readTextFile(filePath: string): Promise<string>;
}

export interface RuntimeScaffoldTraceSpanCall {
  readonly operationKey: string;
  readonly data?: JsonValue;
  readonly context?: JsonValue;
  readonly metadata?: {
    readonly operation?: string;
    readonly topic?: string;
    readonly area?: string;
    readonly rubric?: string;
    readonly tags?: readonly string[];
  };
}

export interface RuntimeScaffoldSystemTraceTracer {
  span<T>(call: RuntimeScaffoldTraceSpanCall, fn: () => T | Promise<T>): Promise<T>;
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
