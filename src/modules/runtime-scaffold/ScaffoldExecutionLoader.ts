import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { RUNTIME_SCAFFOLD_TRACE_EVENTS } from '../../trace-events/index.js';
import { RuntimeScaffoldLoadError } from './errors.js';
import { ScaffoldDescriptorNormalizer } from './ScaffoldDescriptorNormalizer.js';
import type {
  JsonObject,
  RuntimeScaffoldFileSystem,
  RuntimeScaffoldLoadResult,
  RuntimeScaffoldRunFileFormat,
  RuntimeScaffoldSystemTraceTracer,
  ScaffoldControlFile,
} from './types.js';

export interface ScaffoldExecutionLoaderOptions {
  readonly fileSystem?: RuntimeScaffoldFileSystem;
  readonly normalizer?: ScaffoldDescriptorNormalizer;
  readonly systemTraceTracer?: RuntimeScaffoldSystemTraceTracer;
}

export class NodeRuntimeScaffoldFileSystem implements RuntimeScaffoldFileSystem {
  readTextFile(filePath: string): Promise<string> {
    return readFile(filePath, 'utf8');
  }
}

export class ScaffoldExecutionLoader {
  private readonly fileSystem: RuntimeScaffoldFileSystem;
  private readonly normalizer: ScaffoldDescriptorNormalizer;
  private readonly systemTraceTracer?: RuntimeScaffoldSystemTraceTracer;

  constructor(options: ScaffoldExecutionLoaderOptions = {}) {
    this.fileSystem = options.fileSystem ?? new NodeRuntimeScaffoldFileSystem();
    this.normalizer = options.normalizer ?? new ScaffoldDescriptorNormalizer();
    this.systemTraceTracer = options.systemTraceTracer;
  }

  async loadFromControlFile(controlPath: string): Promise<RuntimeScaffoldLoadResult> {
    const resolvedControlPath = path.resolve(controlPath);
    const descriptorEvents = RUNTIME_SCAFFOLD_TRACE_EVENTS.descriptorLoading;

    const controlReadContext = { path: resolvedControlPath };
    await this.traceStarted(descriptorEvents.controlRead, controlReadContext);
    const controlRead = await readJsonFile(this.fileSystem, resolvedControlPath, 'control');
    await this.recordResultTrace(descriptorEvents.controlRead, controlReadContext, controlRead);
    if (!controlRead.ok) {
      return {
        ok: false,
        controlPath: resolvedControlPath,
        error: controlRead.error,
      };
    }

    const controlNormalizeContext = { path: resolvedControlPath };
    await this.traceStarted(descriptorEvents.controlNormalize, controlNormalizeContext);
    const controlResult = normalizeControlFile(controlRead.value, resolvedControlPath);
    await this.recordResultTrace(descriptorEvents.controlNormalize, controlNormalizeContext, controlResult);
    if (!controlResult.ok) {
      return {
        ok: false,
        controlPath: resolvedControlPath,
        error: controlResult.error,
      };
    }

    const executionPathContext = { path: resolvedControlPath, activeExecutionFile: controlResult.control.activeExecutionFile };
    await this.traceStarted(descriptorEvents.executionPathResolve, executionPathContext);
    const executionPath = resolveExecutionPath(controlResult.control.activeExecutionFile, resolvedControlPath);
    await this.recordResultTrace(descriptorEvents.executionPathResolve, executionPathContext, executionPath);
    if (!executionPath.ok) {
      return {
        ok: false,
        controlPath: resolvedControlPath,
        error: executionPath.error,
      };
    }

    const formatContext = { path: executionPath.path };
    await this.traceStarted(descriptorEvents.formatDetect, formatContext);
    const executionFormat = detectExecutionFormat(executionPath.path);
    await this.recordResultTrace(descriptorEvents.formatDetect, formatContext, executionFormat);
    if (!executionFormat.ok) {
      return {
        ok: false,
        controlPath: resolvedControlPath,
        executionPath: executionPath.path,
        error: executionFormat.error,
      };
    }

    const descriptorReadContext = { path: executionPath.path };
    await this.traceStarted(descriptorEvents.descriptorFileRead, descriptorReadContext);
    const descriptorRead = await readJsonFile(this.fileSystem, executionPath.path, 'execution');
    await this.recordResultTrace(descriptorEvents.descriptorFileRead, descriptorReadContext, descriptorRead);
    if (!descriptorRead.ok) {
      return {
        ok: false,
        controlPath: resolvedControlPath,
        executionPath: executionPath.path,
        error: descriptorRead.error,
      };
    }

    try {
      const normalizeContext = { path: executionPath.path };
      await this.traceStarted(descriptorEvents.descriptorNormalize, normalizeContext);
      const normalized = this.normalizer.normalize(descriptorRead.value, executionPath.path);
      await this.traceCompleted(descriptorEvents.descriptorNormalize, {
        ...normalizeContext,
        descriptorId: normalized.descriptor.id,
      });
      return {
        ok: true,
        controlPath: resolvedControlPath,
        executionPath: executionPath.path,
        executionFormat: executionFormat.format,
        descriptorId: normalized.descriptor.id,
        descriptor: normalized.descriptor,
        warnings: normalized.warnings,
      };
    } catch (error) {
      await this.traceFailed(descriptorEvents.descriptorNormalize, { path: executionPath.path, error: traceError(error) });
      return {
        ok: false,
        controlPath: resolvedControlPath,
        executionPath: executionPath.path,
        error: asRuntimeScaffoldLoadError(error, executionPath.path),
      };
    }
  }

  private traceStarted(operationKey: string, data: JsonObject): Promise<void> {
    return this.trace(operationKey, 'started', data);
  }

  private traceCompleted(operationKey: string, data: JsonObject): Promise<void> {
    return this.trace(operationKey, 'completed', data);
  }

  private traceFailed(operationKey: string, data: JsonObject): Promise<void> {
    return this.trace(operationKey, 'failed', data);
  }

  private async recordResultTrace<T extends { readonly ok: boolean }>(
    operationKey: string,
    data: JsonObject,
    result: T,
  ): Promise<void> {
    if (result.ok) {
      await this.traceCompleted(operationKey, data);
      return;
    }
    const error = 'error' in result ? result.error : undefined;
    await this.traceFailed(operationKey, { ...data, error: traceError(error) });
  }

  private async trace(operationKey: string, lifecycle: 'started' | 'completed' | 'failed', data: JsonObject): Promise<void> {
    if (!this.systemTraceTracer) {
      return;
    }

    const status = lifecycle === 'failed' ? 'error' : 'ok';
    const phase = lifecycle === 'started' ? 'START' : lifecycle === 'completed' ? 'END' : 'ERROR';
    await this.systemTraceTracer.record({
      operationKey,
      phase,
      status,
      severity: lifecycle === 'failed' ? 'error' : 'info',
      message: `${operationKey} ${lifecycle}`,
      data: {
        ...data,
        observedOperation: operationKey,
        lifecycle,
      },
      metadata: {
        tags: ['runtime-scaffold', 'descriptor'],
      },
    });
  }
}

type JsonReadResult =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly error: RuntimeScaffoldLoadError };

async function readJsonFile(
  fileSystem: RuntimeScaffoldFileSystem,
  filePath: string,
  phase: 'control' | 'execution',
): Promise<JsonReadResult> {
  let fileContents: string;
  try {
    fileContents = await fileSystem.readTextFile(filePath);
  } catch (error) {
    return {
      ok: false,
      error: new RuntimeScaffoldLoadError({
        message: `Unable to read ${phase} file: ${filePath}`,
        code: phase === 'control' ? 'CONTROL_FILE_READ_FAILED' : 'EXECUTION_FILE_READ_FAILED',
        phase,
        path: filePath,
        cause: error,
      }),
    };
  }

  try {
    return {
      ok: true,
      value: JSON.parse(fileContents),
    };
  } catch (error) {
    return {
      ok: false,
      error: new RuntimeScaffoldLoadError({
        message: `Unable to parse ${phase} file as JSON: ${filePath}`,
        code: phase === 'control' ? 'CONTROL_FILE_PARSE_FAILED' : 'EXECUTION_FILE_PARSE_FAILED',
        phase,
        path: filePath,
        cause: error,
      }),
    };
  }
}

type ControlResult =
  | { readonly ok: true; readonly control: ScaffoldControlFile }
  | { readonly ok: false; readonly error: RuntimeScaffoldLoadError };

function normalizeControlFile(rawControl: unknown, controlPath: string): ControlResult {
  if (typeof rawControl !== 'object' || rawControl === null || Array.isArray(rawControl)) {
    return {
      ok: false,
      error: new RuntimeScaffoldLoadError({
        message: 'Scaffold control file must be a JSON object',
        code: 'CONTROL_FILE_INVALID',
        phase: 'control',
        path: controlPath,
      }),
    };
  }

  const controlRecord = rawControl as { readonly activeExecutionFile?: unknown; readonly selectedExecutionFile?: unknown };
  const activeExecutionFile = controlRecord.activeExecutionFile ?? controlRecord.selectedExecutionFile;

  if (typeof activeExecutionFile !== 'string' || activeExecutionFile.trim() === '') {
    return {
      ok: false,
      error: new RuntimeScaffoldLoadError({
        message: 'Scaffold control file requires activeExecutionFile',
        code: 'CONTROL_FILE_INVALID',
        phase: 'control',
        path: controlPath,
      }),
    };
  }

  return {
    ok: true,
    control: {
      activeExecutionFile,
    },
  };
}

type ExecutionPathResult =
  | { readonly ok: true; readonly path: string }
  | { readonly ok: false; readonly error: RuntimeScaffoldLoadError };

function resolveExecutionPath(executionFile: string, controlPath: string): ExecutionPathResult {
  const controlDirectory = path.dirname(controlPath);
  const resolvedExecutionPath = path.resolve(controlDirectory, executionFile);
  const relativePath = path.relative(controlDirectory, resolvedExecutionPath);

  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    return {
      ok: false,
      error: new RuntimeScaffoldLoadError({
        message: 'activeExecutionFile must resolve inside the control file directory',
        code: 'EXECUTION_PATH_INVALID',
        phase: 'control',
        path: resolvedExecutionPath,
      }),
    };
  }

  return {
    ok: true,
    path: resolvedExecutionPath,
  };
}

type ExecutionFormatResult =
  | { readonly ok: true; readonly format: RuntimeScaffoldRunFileFormat }
  | { readonly ok: false; readonly error: RuntimeScaffoldLoadError };

function detectExecutionFormat(executionPath: string): ExecutionFormatResult {
  if (path.extname(executionPath).toLowerCase() === '.json') {
    return {
      ok: true,
      format: 'json',
    };
  }

  return {
    ok: false,
    error: new RuntimeScaffoldLoadError({
      message: `Unsupported RuntimeScaffold execution descriptor format: ${executionPath}`,
      code: 'EXECUTION_FORMAT_UNSUPPORTED',
      phase: 'execution',
      path: executionPath,
    }),
  };
}

function asRuntimeScaffoldLoadError(error: unknown, pathName: string): RuntimeScaffoldLoadError {
  if (error instanceof RuntimeScaffoldLoadError) {
    return error;
  }
  return new RuntimeScaffoldLoadError({
    message: 'RuntimeScaffold descriptor normalization failed unexpectedly',
    code: 'DESCRIPTOR_INVALID',
    phase: 'normalization',
    path: pathName,
    cause: error,
  });
}

function traceError(error: unknown): JsonObject {
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
