import { RuntimeScaffold } from './RuntimeScaffold.js';
import type { RuntimeScaffoldLoadResult, RuntimeScaffoldSystemTraceTracer } from './types.js';

export interface LoadRuntimeScaffoldFromControlFileOptions {
  readonly systemTraceTracer?: RuntimeScaffoldSystemTraceTracer;
}

export async function loadRuntimeScaffoldFromControlFile(
  controlPath: string,
  options: LoadRuntimeScaffoldFromControlFileOptions = {},
): Promise<RuntimeScaffoldLoadResult> {
  return new RuntimeScaffold({
    systemTraceTracer: options.systemTraceTracer,
  }).loadFromControlFile(controlPath);
}
