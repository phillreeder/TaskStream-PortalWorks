import path from 'node:path';
import {
  validateTenantProcessDefinition,
  type ComposedTenantProcessDefinition,
} from '../../domain/tenantProcess/index.js';
import {
  FlatRuntimeCommandWatcher,
  type FlatRuntimeCommandWatcherOptions,
} from './FlatRuntimeCommandWatcher.js';
import { FlatRuntimePathway, type FlatRuntimePathwayInput, type FlatRuntimePathwayResult } from './FlatRuntimePathway.js';
import { RuntimeScaffoldExecutionError } from './errors.js';
import { RuntimeScaffoldExecutor } from './RuntimeScaffoldExecutor.js';
import { NodeRuntimeScaffoldFileSystem, ScaffoldExecutionLoader } from './ScaffoldExecutionLoader.js';
import { SourceStateLoader } from './SourceStateLoader.js';
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

export interface FlatRuntimeControlExecutionResult extends FlatRuntimePathwayResult {
  readonly configId: string;
  readonly controlPath: string;
  readonly configPath: string;
  readonly warnings: readonly string[];
}

export class RuntimeScaffold {
  private readonly executionLoader: ScaffoldExecutionLoader;
  private readonly executor: RuntimeScaffoldExecutor;
  private readonly flatRuntimePathway = new FlatRuntimePathway();
  private readonly flatTenantProcessLoader: TenantProcessLoader;
  private readonly flatSourceStateLoader: SourceStateLoader;

  constructor(options: RuntimeScaffoldOptions = {}) {
    const fileSystem = options.fileSystem ?? new NodeRuntimeScaffoldFileSystem();
    this.executionLoader = options.executionLoader ?? new ScaffoldExecutionLoader({
      fileSystem,
      systemTraceTracer: options.systemTraceTracer,
    });
    this.executor = options.executor ?? new RuntimeScaffoldExecutor({
      fileSystem,
      sourceStateFixtures: options.sourceStateFixtures,
      systemTraceTracer: options.systemTraceTracer,
      ...(options.tenantProcessFixtures ? {
        tenantProcessLoader: new TenantProcessLoader({
          fileSystem,
          fixtures: options.tenantProcessFixtures,
        }),
      } : {}),
    });
    this.flatTenantProcessLoader = new TenantProcessLoader({
      fileSystem,
      fixtures: options.tenantProcessFixtures,
    });
    this.flatSourceStateLoader = new SourceStateLoader({
      fileSystem,
      sourceStateFixtures: options.sourceStateFixtures,
    });
  }

  loadFromControlFile(controlPath: string): Promise<RuntimeScaffoldLoadResult> {
    return this.executionLoader.loadFromControlFile(controlPath);
  }

  executeFlat(input: FlatRuntimePathwayInput): Promise<FlatRuntimePathwayResult> {
    return this.flatRuntimePathway.run(input);
  }

  async executeFlatFromControlFile(controlPath: string): Promise<FlatRuntimeControlExecutionResult> {
    const load = await this.loadFromControlFile(controlPath);
    if (!load.ok) throw load.error;
    if (load.descriptor.mode !== 'flatTask') {
      throw new RuntimeScaffoldExecutionError({
        message: `Flat RuntimeScaffold command requires mode flatTask, received ${load.descriptor.mode}`,
        code: 'EXECUTION_MODE_UNSUPPORTED',
        phase: 'mode',
        path: load.executionPath,
      });
    }

    const tenantProcess = await this.flatTenantProcessLoader.load({
      reference: load.descriptor.tenantProcessRef,
      executionPath: load.executionPath,
    });
    try {
      validateTenantProcessDefinition(tenantProcess);
    } catch (error) {
      throw new RuntimeScaffoldExecutionError({
        message: 'Flat RuntimeScaffold TenantProcess failed canonical validation',
        code: 'TENANT_PROCESS_INVALID',
        phase: 'tenant-process',
        path: load.executionPath,
        cause: error,
      });
    }

    const initialState = await this.flatSourceStateLoader.load(load);
    if (!isRecord(initialState)) {
      throw new RuntimeScaffoldExecutionError({
        message: 'Flat RuntimeScaffold initial state must resolve to an object',
        code: 'SOURCE_STATE_INVALID',
        phase: 'source-state',
        path: load.executionPath,
      });
    }

    const rawInput = load.descriptor.execution?.input ?? {};
    if (!isRecord(rawInput)) {
      throw new RuntimeScaffoldExecutionError({
        message: 'Flat RuntimeScaffold input must be an object',
        code: 'SOURCE_STATE_INVALID',
        phase: 'source-state',
        path: load.executionPath,
      });
    }

    const configuredRuntimeRoot = load.descriptor.output?.outputDir;
    if (!configuredRuntimeRoot) {
      throw new RuntimeScaffoldExecutionError({
        message: 'Flat RuntimeScaffold config requires runtimeRoot or output.outputDir',
        code: 'RESULT_WRITE_FAILED',
        phase: 'result-writing',
        path: load.executionPath,
      });
    }

    const configDirectory = path.dirname(load.executionPath);
    const runtimeRoot = path.isAbsolute(configuredRuntimeRoot)
      ? path.normalize(configuredRuntimeRoot)
      : path.resolve(configDirectory, configuredRuntimeRoot);
    const result = await this.flatRuntimePathway.run({
      tenantProcess: tenantProcess as unknown as ComposedTenantProcessDefinition,
      taskRef: load.descriptor.taskId,
      initialState,
      input: rawInput,
      runtimeRoot,
      artifactBasePath: configDirectory,
    });

    return {
      ...result,
      configId: load.descriptor.id,
      controlPath: load.controlPath,
      configPath: load.executionPath,
      warnings: load.warnings,
    };
  }

  watchFlatCommandFile(
    commandPath: string,
    options: FlatRuntimeCommandWatcherOptions = {},
  ): FlatRuntimeCommandWatcher {
    return new FlatRuntimeCommandWatcher(this, commandPath, options).start();
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
