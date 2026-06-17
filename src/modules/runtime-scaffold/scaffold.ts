import { RuntimeScaffold } from './RuntimeScaffold.js';
import type {
  RuntimeScaffoldExecutionResult,
  RuntimeScaffoldLoadResult,
  RuntimeScaffoldSystemTraceTracer,
} from './types.js';

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

export interface ExecuteRuntimeScaffoldFromControlFileOptions extends LoadRuntimeScaffoldFromControlFileOptions {
  readonly tenantProcessFixtures?: Readonly<Record<string, unknown>>;
  readonly sourceStateFixtures?: Readonly<Record<string, unknown>>;
}

export async function executeRuntimeScaffoldFromControlFile(
  controlPath: string,
  options: ExecuteRuntimeScaffoldFromControlFileOptions = {},
): Promise<RuntimeScaffoldExecutionResult> {
  return new RuntimeScaffold({
    systemTraceTracer: options.systemTraceTracer,
    tenantProcessFixtures: options.tenantProcessFixtures,
    sourceStateFixtures: options.sourceStateFixtures,
  }).executeFromControlFile(controlPath);
}
