import { RuntimeScaffoldExecutionError } from './errors.js';
import { ResultWriter } from './ResultWriter.js';
import {
  runRuntimeScaffoldPipeline,
  type RuntimeScaffoldPipelineDependencies,
} from './RuntimeScaffoldPipeline.js';
import { RuntimeScaffoldPipelineTracer } from './RuntimeScaffoldPipelineTracer.js';
import type { RuntimeScaffoldPipelineObserver } from './RuntimeScaffoldPipelineTypes.js';
import { ScaffoldFlowRunner } from './ScaffoldFlowRunner.js';
import { NodeRuntimeScaffoldFileSystem } from './ScaffoldExecutionLoader.js';
import { SourceStateLoader } from './SourceStateLoader.js';
import { TenantProcessLoader } from './TenantProcessLoader.js';
import type {
  RuntimeScaffoldExecutionResult,
  RuntimeScaffoldFileSystem,
  RuntimeScaffoldLoadSuccess,
  RuntimeScaffoldSystemTraceTracer,
} from './types.js';

export interface RuntimeScaffoldExecutorOptions {
  readonly fileSystem?: RuntimeScaffoldFileSystem;
  readonly tenantProcessLoader?: TenantProcessLoader;
  readonly sourceStateLoader?: SourceStateLoader;
  readonly flowRunner?: ScaffoldFlowRunner;
  readonly resultWriter?: ResultWriter;
  readonly sourceStateFixtures?: Readonly<Record<string, unknown>>;
  readonly systemTraceTracer?: RuntimeScaffoldSystemTraceTracer;
  readonly stageObserver?: RuntimeScaffoldPipelineObserver;
}

export class RuntimeScaffoldExecutor {
  private readonly tenantProcessLoader: TenantProcessLoader;
  private readonly sourceStateLoader: SourceStateLoader;
  private readonly flowRunner: ScaffoldFlowRunner;
  private readonly resultWriter: ResultWriter;
  private readonly systemTraceTracer?: RuntimeScaffoldSystemTraceTracer;
  private readonly stageObserver?: RuntimeScaffoldPipelineObserver;

  constructor(options: RuntimeScaffoldExecutorOptions = {}) {
    const fileSystem = options.fileSystem ?? new NodeRuntimeScaffoldFileSystem();
    this.tenantProcessLoader = options.tenantProcessLoader ?? new TenantProcessLoader({
      fileSystem,
    });
    this.sourceStateLoader = options.sourceStateLoader ?? new SourceStateLoader({
      fileSystem,
      sourceStateFixtures: options.sourceStateFixtures,
    });
    this.flowRunner = options.flowRunner ?? new ScaffoldFlowRunner();
    this.resultWriter = options.resultWriter ?? new ResultWriter();
    this.systemTraceTracer = options.systemTraceTracer;
    this.stageObserver = options.stageObserver;
  }

  async executeLoaded(load: RuntimeScaffoldLoadSuccess): Promise<RuntimeScaffoldExecutionResult> {
    try {
      return await runRuntimeScaffoldPipeline(load, this.createPipelineDependencies());
    } catch (error) {
      const executionError = normalizeExecutionError(error);
      return {
        ok: false,
        status: 'failed',
        controlPath: load.controlPath,
        executionPath: load.executionPath,
        executionFormat: load.executionFormat,
        descriptorId: load.descriptor.id,
        descriptor: load.descriptor,
        mode: load.descriptor.mode,
        taskId: load.descriptor.taskId,
        errorPhase: executionError.phase,
        error: executionError,
        warnings: load.warnings,
      };
    }
  }

  private createPipelineDependencies(): RuntimeScaffoldPipelineDependencies {
    return {
      tenantProcessLoader: this.tenantProcessLoader,
      sourceStateLoader: this.sourceStateLoader,
      flowRunner: this.flowRunner,
      resultWriter: this.resultWriter,
      tracer: new RuntimeScaffoldPipelineTracer(this.systemTraceTracer),
      stageObserver: this.stageObserver,
    };
  }
}

function normalizeExecutionError(error: unknown): RuntimeScaffoldExecutionError {
  if (error instanceof RuntimeScaffoldExecutionError) {
    return error;
  }
  return new RuntimeScaffoldExecutionError({
    message: 'RuntimeScaffold execution failed unexpectedly',
    code: 'FLOW_EXECUTION_FAILED',
    phase: 'flow-execution',
    cause: error,
  });
}
