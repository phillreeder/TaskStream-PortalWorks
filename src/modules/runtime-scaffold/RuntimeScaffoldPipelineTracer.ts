import type { JsonObject, RuntimeScaffoldSystemTraceTracer } from './types.js';
import type { RuntimeScaffoldPipelineTrace } from './RuntimeScaffoldPipelineTypes.js';

export type RuntimeScaffoldTraceLifecycle = 'started' | 'completed' | 'failed';

export class RuntimeScaffoldPipelineTracer {
  readonly trace: RuntimeScaffoldPipelineTrace = {
    operations: [],
  };

  constructor(private readonly systemTraceTracer?: RuntimeScaffoldSystemTraceTracer) {}

  started(operationKey: string, data: Record<string, unknown>): Promise<void> {
    return this.emit(operationKey, 'started', data);
  }

  completed(operationKey: string, data: Record<string, unknown>): Promise<void> {
    return this.emit(operationKey, 'completed', data);
  }

  failed(operationKey: string, data: Record<string, unknown>): Promise<void> {
    return this.emit(operationKey, 'failed', data);
  }

  async emit(
    operationKey: string,
    data: Record<string, unknown>,
  ): Promise<void>;
  async emit(
    operationKey: string,
    lifecycle: RuntimeScaffoldTraceLifecycle,
    data: Record<string, unknown>,
  ): Promise<void>;
  async emit(
    operationKey: string,
    lifecycleOrData: RuntimeScaffoldTraceLifecycle | Record<string, unknown>,
    maybeData?: Record<string, unknown>,
  ): Promise<void> {
    const lifecycle = typeof lifecycleOrData === 'string' ? lifecycleOrData : undefined;
    const data = (lifecycle ? maybeData : lifecycleOrData) ?? {};
    const status = lifecycle === 'failed' ? 'error' : 'ok';
    const phase = lifecycle === 'started' ? 'START' : lifecycle === 'completed' ? 'END' : lifecycle === 'failed' ? 'ERROR' : 'POINT';

    if (!lifecycle) {
      this.trace.operations.push(operationKey);
    } else if (lifecycle === 'started') {
      this.trace.operations.push(operationKey);
    }

    if (!this.systemTraceTracer) {
      return;
    }

    await this.systemTraceTracer.record({
      operationKey,
      phase,
      status,
      severity: lifecycle === 'failed' ? 'error' : 'info',
      message: lifecycle ? `${operationKey} ${lifecycle}` : operationKey,
      data: {
        ...(data as JsonObject),
        observedOperation: operationKey,
        lifecycle: lifecycle ?? 'point',
      },
      metadata: {
        tags: ['runtime-scaffold', 'runtime-spine', 'flowOnly'],
      },
    });
  }
}
