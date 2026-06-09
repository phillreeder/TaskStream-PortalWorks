import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { sanitizeTraceValue } from './safeContext.js';
import type {
  JsonValue,
  SystemTraceAdapter,
  SystemTraceBoundTracerOptions,
  SystemTraceCaptureFailure,
  SystemTraceCaptureInput,
  SystemTraceCaptureResult,
  SystemTraceErrorMetadata,
  SystemTraceOperationMetadata,
  SystemTraceOperationPreset,
  SystemTraceRecord,
  SystemTraceRecordCall,
  SystemTraceSpanCall,
  SystemTraceSpanInput,
} from './types.js';

export interface SystemTraceRecorderOptions {
  readonly adapter: SystemTraceAdapter;
}

export class SystemTraceRecorder {
  private readonly adapter: SystemTraceAdapter;
  private sequence = 0;
  private readonly failures: SystemTraceCaptureFailure[] = [];

  constructor(options: SystemTraceRecorderOptions) {
    this.adapter = options.adapter;
  }

  capture(input: SystemTraceCaptureInput): Promise<SystemTraceCaptureResult> {
    return this.write(input);
  }

  log(input: Omit<SystemTraceCaptureInput, 'family'>): Promise<SystemTraceCaptureResult> {
    return this.write({ ...input, family: 'log' });
  }

  trace(input: Omit<SystemTraceCaptureInput, 'family'>): Promise<SystemTraceCaptureResult> {
    return this.write({ ...input, family: 'trace' });
  }

  telemetry(input: Omit<SystemTraceCaptureInput, 'family'>): Promise<SystemTraceCaptureResult> {
    return this.write({ ...input, family: 'telemetry' });
  }

  async span<T>(input: SystemTraceSpanInput, fn: () => T | Promise<T>): Promise<T> {
    const traceId = input.traceId ?? randomUUID();
    const spanId = input.spanId ?? randomUUID();
    const startedAt = new Date();
    const monotonicStart = performance.now();
    await this.write({
      ...input,
      family: 'span',
      phase: 'START',
      status: 'ok',
      traceId,
      spanId,
      timing: {
        startedAt: startedAt.toISOString(),
        monotonicStart,
      },
    });

    try {
      const value = await fn();
      await this.closeSpan(input, traceId, spanId, startedAt, monotonicStart, 'ok');
      return value;
    } catch (error) {
      await this.closeSpan(input, traceId, spanId, startedAt, monotonicStart, 'error', normalizeError(error));
      throw error;
    }
  }

  createTracer(options: SystemTraceBoundTracerOptions): SystemTraceBoundTracer {
    return new SystemTraceBoundTracer(this, options);
  }

  flush(): Promise<void> {
    return this.adapter.flush();
  }

  getFailures(): readonly SystemTraceCaptureFailure[] {
    return [...this.failures];
  }

  private async closeSpan(
    input: SystemTraceSpanInput,
    traceId: string,
    spanId: string,
    startedAt: Date,
    monotonicStart: number,
    status: 'ok' | 'error',
    error?: SystemTraceErrorMetadata,
  ): Promise<void> {
    const endedAt = new Date();
    const monotonicEnd = performance.now();
    await this.write({
      ...input,
      family: 'span',
      phase: 'END',
      status,
      traceId,
      spanId,
      timing: {
        startedAt: startedAt.toISOString(),
        endedAt: endedAt.toISOString(),
        monotonicStart,
        monotonicEnd,
        durationMs: Math.max(0, monotonicEnd - monotonicStart),
      },
      ...(error ? { error } : {}),
    });
  }

  private async write(input: SystemTraceCaptureInput): Promise<SystemTraceCaptureResult> {
    const record: SystemTraceRecord = {
      ...input,
      seq: this.sequence + 1,
      timestamp: new Date().toISOString(),
      tags: normalizeTags(input.tags),
      ...(input.context !== undefined ? { context: sanitizeTraceValue(input.context) } : {}),
      ...(input.data !== undefined ? { data: sanitizeTraceValue(input.data) } : {}),
    };

    try {
      await this.adapter.append(record);
      this.sequence = record.seq;
      return { ok: true, record };
    } catch (cause) {
      const failure = {
        message: 'SystemTrace adapter failed to capture record',
        cause,
        record,
      };
      this.failures.push(failure);
      return { ok: false, error: failure };
    }
  }
}

export class SystemTraceBoundTracer {
  constructor(
    private readonly recorder: SystemTraceRecorder,
    private readonly options: SystemTraceBoundTracerOptions,
  ) {}

  record(callOrOperationKey: SystemTraceRecordCall | string, data?: JsonValue): Promise<SystemTraceCaptureResult> {
    const call = normalizeRecordCall(callOrOperationKey, data);
    return this.recorder.trace({
      ...this.resolve(call.operationKey, call.metadata),
      phase: 'POINT',
      data: call.data,
      context: call.context,
    });
  }

  span<T>(callOrOperationKey: SystemTraceSpanCall | string, data: JsonValue | (() => T | Promise<T>), fn?: () => T | Promise<T>): Promise<T> {
    const call = typeof callOrOperationKey === 'string'
      ? { operationKey: callOrOperationKey, data: typeof data === 'function' ? undefined : data }
      : callOrOperationKey;
    const callback = typeof data === 'function' ? data : fn;
    if (!callback) {
      throw new Error('SystemTraceBoundTracer.span requires a callback');
    }
    return this.recorder.span(
      {
        ...this.resolve(call.operationKey, call.metadata),
        traceId: call.traceId,
        parentSpanId: call.parentSpanId,
        data: call.data,
        context: call.context,
      },
      callback,
    );
  }

  private resolve(operationKey: string, metadata?: SystemTraceOperationMetadata): SystemTraceSpanInput {
    const preset = this.options.presets?.[operationKey];
    const normalizedPreset = normalizePreset(operationKey, preset);
    return {
      runId: this.options.runId,
      requestId: this.options.requestId,
      correlationId: this.options.correlationId,
      source: this.options.source,
      component: this.options.component,
      operation: operationKey,
      ...withoutUndefined({
        topic: this.options.topic,
        area: this.options.area,
        rubric: this.options.rubric,
      }),
      ...normalizedPreset,
      ...metadata,
      tags: mergeTags(this.options.tags, normalizedPreset.tags, metadata?.tags),
    };
  }
}

export function normalizeError(error: unknown): SystemTraceErrorMetadata {
  if (error instanceof Error) {
    const maybeCode = (error as Error & { readonly code?: unknown }).code;
    return {
      name: error.name,
      message: error.message,
      ...(typeof maybeCode === 'string' ? { code: maybeCode } : {}),
    };
  }
  return {
    name: typeof error,
    message: String(error),
  };
}

function normalizeRecordCall(callOrOperationKey: SystemTraceRecordCall | string, data?: JsonValue): SystemTraceRecordCall {
  return typeof callOrOperationKey === 'string' ? { operationKey: callOrOperationKey, data } : callOrOperationKey;
}

function normalizePreset(operationKey: string, preset?: SystemTraceOperationPreset | string): SystemTraceOperationPreset {
  if (!preset) {
    return { operation: operationKey };
  }
  return typeof preset === 'string' ? { operation: preset } : preset;
}

function normalizeTags(tags?: readonly string[]): readonly string[] {
  return tags ? [...tags] : [];
}

function mergeTags(...tagLists: readonly (readonly string[] | undefined)[]): readonly string[] {
  return [...new Set(tagLists.flatMap((tags) => tags ?? []))];
}

function withoutUndefined<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as Partial<T>;
}
