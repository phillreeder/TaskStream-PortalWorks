import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { normalizeError } from '../../../SystemTrace/index.js';
import type {
  JsonValue,
  SystemTraceBoundTracerOptions,
  SystemTraceCaptureInput,
  SystemTraceCaptureResult,
  SystemTraceOperationMetadata,
  SystemTraceOperationPreset,
  SystemTraceRecordCall,
  SystemTraceSpanCall,
  SystemTraceSpanInput,
} from '../../../SystemTrace/index.js';
import type { ModuleLinkCore } from '../../core/index.js';

export interface ModuleLinkSystemTraceFacadeOptions {
  readonly core: ModuleLinkCore;
  readonly sourceModule?: string;
}

export class ModuleLinkSystemTraceFacade {
  private readonly core: ModuleLinkCore;
  private readonly sourceModule: string;

  constructor(options: ModuleLinkSystemTraceFacadeOptions) {
    this.core = options.core;
    this.sourceModule = options.sourceModule ?? 'ModuleLink';
  }

  async record(input: Omit<SystemTraceCaptureInput, 'family'> & { readonly family?: SystemTraceCaptureInput['family'] }): Promise<SystemTraceCaptureResult> {
    const result = await this.core.deliver<SystemTraceCaptureResult>({
      sourceModule: this.sourceModule,
      targetModule: 'SystemTrace',
      action: 'record',
      payload: {
        ...input,
        family: input.family ?? 'trace',
      },
    });

    if (!result.ok) {
      return {
        ok: false,
        error: {
          message: result.error.message,
          cause: result.error,
        },
      };
    }
    return result.value;
  }

  async span<T>(input: SystemTraceSpanInput, fn: () => T | Promise<T>): Promise<T> {
    const traceId = input.traceId ?? randomUUID();
    const spanId = input.spanId ?? randomUUID();
    const startedAt = new Date();
    const monotonicStart = performance.now();

    await this.record({
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
      await this.closeSpan(input, traceId, spanId, startedAt, monotonicStart, 'error', error);
      throw error;
    }
  }

  createTracer(options: SystemTraceBoundTracerOptions): ModuleLinkSystemTraceBoundTracer {
    return new ModuleLinkSystemTraceBoundTracer(this, options);
  }

  private async closeSpan(
    input: SystemTraceSpanInput,
    traceId: string,
    spanId: string,
    startedAt: Date,
    monotonicStart: number,
    status: 'ok' | 'error',
    error?: unknown,
  ): Promise<void> {
    const endedAt = new Date();
    const monotonicEnd = performance.now();
    await this.record({
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
      ...(error ? { error: normalizeError(error) } : {}),
    });
  }
}

export class ModuleLinkSystemTraceBoundTracer {
  constructor(
    private readonly facade: ModuleLinkSystemTraceFacade,
    private readonly options: SystemTraceBoundTracerOptions,
  ) {}

  record(callOrOperationKey: SystemTraceRecordCall | string, data?: JsonValue): Promise<SystemTraceCaptureResult> {
    const call = typeof callOrOperationKey === 'string' ? { operationKey: callOrOperationKey, data } : callOrOperationKey;
    return this.facade.record({
      ...this.resolve(call.operationKey, call.metadata),
      phase: call.phase ?? 'POINT',
      severity: call.severity,
      status: call.status,
      message: call.message,
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
      throw new Error('ModuleLinkSystemTraceBoundTracer.span requires a callback');
    }
    return this.facade.span(
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

function normalizePreset(operationKey: string, preset?: SystemTraceOperationPreset | string): SystemTraceOperationPreset {
  if (!preset) {
    return { operation: operationKey };
  }
  return typeof preset === 'string' ? { operation: preset } : preset;
}

function mergeTags(...tagLists: readonly (readonly string[] | undefined)[]): readonly string[] {
  return [...new Set(tagLists.flatMap((tags) => tags ?? []))];
}

function withoutUndefined<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as Partial<T>;
}
