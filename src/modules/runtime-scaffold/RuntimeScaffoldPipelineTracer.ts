import type { JsonObject, RuntimeScaffoldSystemTraceTracer } from './types.js';
import type { RuntimeScaffoldPipelineTrace } from './RuntimeScaffoldPipelineTypes.js';

export class RuntimeScaffoldPipelineTracer {
  readonly trace: RuntimeScaffoldPipelineTrace = {
    operations: [],
  };

  constructor(private readonly systemTraceTracer?: RuntimeScaffoldSystemTraceTracer) {}

  traceValue<T>(
    operationKey: string,
    data: Record<string, unknown>,
    fn: () => T | Promise<T>,
  ): Promise<T> {
    this.trace.operations.push(operationKey);
    if (!this.systemTraceTracer) {
      return Promise.resolve(fn());
    }

    return this.systemTraceTracer.span(
      {
        operationKey,
        data: data as JsonObject,
        metadata: {
          tags: ['runtime-scaffold', 'runtime-spine', 'flowOnly'],
        },
      },
      fn,
    );
  }
}
