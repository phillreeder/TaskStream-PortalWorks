import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { RuntimeScaffoldLoadError } from './errors.js';
import { ScaffoldDescriptorNormalizer } from './ScaffoldDescriptorNormalizer.js';
import type {
  RuntimeScaffoldFileSystem,
  RuntimeScaffoldLoadResult,
  RuntimeScaffoldRunFileFormat,
  ScaffoldControlFile,
} from './types.js';

export interface ScaffoldExecutionLoaderOptions {
  readonly fileSystem?: RuntimeScaffoldFileSystem;
  readonly normalizer?: ScaffoldDescriptorNormalizer;
}

export class NodeRuntimeScaffoldFileSystem implements RuntimeScaffoldFileSystem {
  readTextFile(filePath: string): Promise<string> {
    return readFile(filePath, 'utf8');
  }
}

export class ScaffoldExecutionLoader {
  private readonly fileSystem: RuntimeScaffoldFileSystem;
  private readonly normalizer: ScaffoldDescriptorNormalizer;

  constructor(options: ScaffoldExecutionLoaderOptions = {}) {
    this.fileSystem = options.fileSystem ?? new NodeRuntimeScaffoldFileSystem();
    this.normalizer = options.normalizer ?? new ScaffoldDescriptorNormalizer();
  }

  async loadFromControlFile(controlPath: string): Promise<RuntimeScaffoldLoadResult> {
    const resolvedControlPath = path.resolve(controlPath);

    const controlRead = await readJsonFile(this.fileSystem, resolvedControlPath, 'control');
    if (!controlRead.ok) {
      return {
        ok: false,
        controlPath: resolvedControlPath,
        error: controlRead.error,
      };
    }

    const controlResult = normalizeControlFile(controlRead.value, resolvedControlPath);
    if (!controlResult.ok) {
      return {
        ok: false,
        controlPath: resolvedControlPath,
        error: controlResult.error,
      };
    }

    const executionPath = resolveExecutionPath(controlResult.control.activeExecutionFile, resolvedControlPath);
    if (!executionPath.ok) {
      return {
        ok: false,
        controlPath: resolvedControlPath,
        error: executionPath.error,
      };
    }

    const executionFormat = detectExecutionFormat(executionPath.path);
    if (!executionFormat.ok) {
      return {
        ok: false,
        controlPath: resolvedControlPath,
        executionPath: executionPath.path,
        error: executionFormat.error,
      };
    }

    const descriptorRead = await readJsonFile(this.fileSystem, executionPath.path, 'execution');
    if (!descriptorRead.ok) {
      return {
        ok: false,
        controlPath: resolvedControlPath,
        executionPath: executionPath.path,
        error: descriptorRead.error,
      };
    }

    try {
      const normalized = this.normalizer.normalize(descriptorRead.value, executionPath.path);
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
      return {
        ok: false,
        controlPath: resolvedControlPath,
        executionPath: executionPath.path,
        error: asRuntimeScaffoldLoadError(error, executionPath.path),
      };
    }
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
