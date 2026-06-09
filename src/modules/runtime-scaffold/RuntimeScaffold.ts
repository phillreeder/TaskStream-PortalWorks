import { ScaffoldExecutionLoader } from './ScaffoldExecutionLoader.js';
import type { RuntimeScaffoldLoadResult, RuntimeScaffoldSystemTraceTracer } from './types.js';

export interface RuntimeScaffoldOptions {
  readonly executionLoader?: ScaffoldExecutionLoader;
  readonly systemTraceTracer?: RuntimeScaffoldSystemTraceTracer;
}

export class RuntimeScaffold {
  private readonly executionLoader: ScaffoldExecutionLoader;

  constructor(options: RuntimeScaffoldOptions = {}) {
    this.executionLoader = options.executionLoader ?? new ScaffoldExecutionLoader({
      systemTraceTracer: options.systemTraceTracer,
    });
  }

  loadFromControlFile(controlPath: string): Promise<RuntimeScaffoldLoadResult> {
    return this.executionLoader.loadFromControlFile(controlPath);
  }
}
