import { RuntimeScaffoldExecutor } from './RuntimeScaffoldExecutor.js';
import { ScaffoldExecutionLoader } from './ScaffoldExecutionLoader.js';
import { TenantProcessLoader } from './TenantProcessLoader.js';
import type {
  RuntimeScaffoldExecutionResult,
  RuntimeScaffoldFileSystem,
  RuntimeScaffoldLoadResult,
  RuntimeScaffoldSystemTraceTracer,
} from './types.js';

export interface RuntimeScaffoldOptions {
  readonly executionLoader?: ScaffoldExecutionLoader;
  readonly executor?: RuntimeScaffoldExecutor;
  readonly fileSystem?: RuntimeScaffoldFileSystem;
  readonly systemTraceTracer?: RuntimeScaffoldSystemTraceTracer;
  readonly tenantProcessFixtures?: Readonly<Record<string, unknown>>;
  readonly sourceStateFixtures?: Readonly<Record<string, unknown>>;
}

export class RuntimeScaffold {
  private readonly executionLoader: ScaffoldExecutionLoader;
  private readonly executor: RuntimeScaffoldExecutor;

  constructor(options: RuntimeScaffoldOptions = {}) {
    this.executionLoader = options.executionLoader ?? new ScaffoldExecutionLoader({
      fileSystem: options.fileSystem,
      systemTraceTracer: options.systemTraceTracer,
    });
    this.executor = options.executor ?? new RuntimeScaffoldExecutor({
      fileSystem: options.fileSystem,
      sourceStateFixtures: options.sourceStateFixtures,
      systemTraceTracer: options.systemTraceTracer,
      ...(options.tenantProcessFixtures ? {
        tenantProcessLoader: new TenantProcessLoader({
          fileSystem: options.fileSystem,
          fixtures: options.tenantProcessFixtures,
        }),
      } : {}),
    });
  }

  loadFromControlFile(controlPath: string): Promise<RuntimeScaffoldLoadResult> {
    return this.executionLoader.loadFromControlFile(controlPath);
  }

  async executeFromControlFile(controlPath: string): Promise<RuntimeScaffoldExecutionResult> {
    const loadResult = await this.loadFromControlFile(controlPath);
    if (!loadResult.ok) {
      return {
        ok: false,
        status: 'failed',
        controlPath: loadResult.controlPath,
        executionPath: loadResult.executionPath,
        errorPhase: 'descriptor-loading',
        error: loadResult.error,
        warnings: [],
      };
    }

    return this.executor.executeLoaded(loadResult);
  }
}
