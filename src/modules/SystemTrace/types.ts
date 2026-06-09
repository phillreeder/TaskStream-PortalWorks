export type JsonPrimitive = string | number | boolean | null;
export type JsonObject = { readonly [key: string]: JsonValue };
export type JsonArray = readonly JsonValue[];
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;

export type SystemTraceRecordFamily = 'log' | 'trace' | 'telemetry' | 'span';
export type SystemTracePhase = 'START' | 'END' | 'POINT' | 'ERROR';
export type SystemTraceSeverity = 'debug' | 'info' | 'warn' | 'error';
export type SystemTraceStatus = 'ok' | 'error' | 'rejected';

export interface SystemTraceSource {
  readonly path?: string;
  readonly relativePath?: string;
  readonly module?: string;
  readonly className?: string;
  readonly method?: string;
  readonly functionName?: string;
  readonly packageName?: string;
}

export interface SystemTraceTiming {
  readonly startedAt?: string;
  readonly endedAt?: string;
  readonly durationMs?: number;
  readonly monotonicStart?: number;
  readonly monotonicEnd?: number;
}

export interface SystemTraceErrorMetadata {
  readonly name: string;
  readonly message: string;
  readonly code?: string;
}

export interface SystemTraceOperationMetadata {
  readonly operation?: string;
  readonly topic?: string;
  readonly area?: string;
  readonly rubric?: string;
  readonly tags?: readonly string[];
}

export interface SystemTraceCaptureInput extends SystemTraceOperationMetadata {
  readonly family: SystemTraceRecordFamily;
  readonly traceId?: string;
  readonly spanId?: string;
  readonly parentSpanId?: string;
  readonly runId?: string;
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly phase?: SystemTracePhase;
  readonly source?: SystemTraceSource;
  readonly component?: string;
  readonly eventType?: string;
  readonly message?: string;
  readonly severity?: SystemTraceSeverity;
  readonly status?: SystemTraceStatus;
  readonly context?: JsonValue;
  readonly data?: JsonValue;
  readonly timing?: SystemTraceTiming;
  readonly error?: SystemTraceErrorMetadata;
}

export interface SystemTraceRecord extends SystemTraceCaptureInput {
  readonly seq: number;
  readonly timestamp: string;
  readonly tags: readonly string[];
  readonly context?: JsonValue;
  readonly data?: JsonValue;
}

export interface SystemTraceCaptureFailure {
  readonly message: string;
  readonly cause?: unknown;
  readonly record?: SystemTraceRecord;
}

export type SystemTraceCaptureResult =
  | { readonly ok: true; readonly record: SystemTraceRecord }
  | { readonly ok: false; readonly error: SystemTraceCaptureFailure };

export interface SystemTraceAdapter {
  append(record: SystemTraceRecord): Promise<void>;
  flush(): Promise<void>;
}

export interface SystemTraceSpanInput extends Omit<SystemTraceCaptureInput, 'family' | 'phase' | 'status' | 'timing' | 'error'> {
  readonly operation: string;
  readonly status?: SystemTraceStatus;
}

export interface SystemTraceOperationPreset extends SystemTraceOperationMetadata {
  readonly eventType?: string;
  readonly message?: string;
}

export interface SystemTraceBoundTracerOptions extends SystemTraceOperationMetadata {
  readonly source?: SystemTraceSource;
  readonly component?: string;
  readonly runId?: string;
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly presets?: Readonly<Record<string, SystemTraceOperationPreset | string>>;
}

export interface SystemTraceRecordCall {
  readonly operationKey: string;
  readonly data?: JsonValue;
  readonly context?: JsonValue;
  readonly metadata?: SystemTraceOperationMetadata;
}

export interface SystemTraceSpanCall extends SystemTraceRecordCall {
  readonly parentSpanId?: string;
  readonly traceId?: string;
}
