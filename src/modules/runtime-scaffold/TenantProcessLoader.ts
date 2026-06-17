import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { RuntimeScaffoldExecutionError } from './errors.js';
import { NodeRuntimeScaffoldFileSystem } from './ScaffoldExecutionLoader.js';
import type { RuntimeScaffoldFileSystem, RuntimeScaffoldReference } from './types.js';

export interface TenantProcessLoaderOptions {
  readonly fileSystem?: RuntimeScaffoldFileSystem;
  readonly fixtures?: Readonly<Record<string, unknown>>;
}

export interface TenantProcessLoadInput {
  readonly reference: RuntimeScaffoldReference;
  readonly executionPath?: string;
}

export class TenantProcessLoader {
  private readonly fileSystem: RuntimeScaffoldFileSystem;
  private readonly fixtures: Readonly<Record<string, unknown>>;

  constructor(options: TenantProcessLoaderOptions = {}) {
    this.fileSystem = options.fileSystem ?? new NodeRuntimeScaffoldFileSystem();
    this.fixtures = options.fixtures ?? {};
  }

  async load(input: TenantProcessLoadInput): Promise<unknown> {
    const { reference, executionPath } = input;

    if (reference.kind === 'fixture') {
      if (Object.prototype.hasOwnProperty.call(this.fixtures, reference.ref)) {
        return this.fixtures[reference.ref];
      }
      throw new RuntimeScaffoldExecutionError({
        message: `TenantProcess fixture not found: ${reference.ref}`,
        code: 'TENANT_PROCESS_NOT_FOUND',
        phase: 'tenant-process',
        details: { reference },
      });
    }

    if (reference.kind === 'file') {
      const resolvedPath = resolveRuntimeReferencePath(reference.ref, executionPath);
      try {
        return JSON.parse(await this.fileSystem.readTextFile(resolvedPath));
      } catch (error) {
        throw new RuntimeScaffoldExecutionError({
          message: `Unable to load TenantProcess file: ${resolvedPath}`,
          code: 'TENANT_PROCESS_LOAD_FAILED',
          phase: 'tenant-process',
          path: resolvedPath,
          details: { reference },
          cause: error,
        });
      }
    }

    if (reference.kind === 'module') {
      const resolvedSpecifier = resolveModuleSpecifier(reference.ref, executionPath);
      try {
        const loadedModule = await import(resolvedSpecifier);
        return selectTenantProcessExport(loadedModule, reference.ref);
      } catch (error) {
        if (error instanceof RuntimeScaffoldExecutionError) {
          throw error;
        }
        throw new RuntimeScaffoldExecutionError({
          message: `Unable to load TenantProcess module: ${reference.ref}`,
          code: 'TENANT_PROCESS_LOAD_FAILED',
          phase: 'tenant-process',
          details: { reference, resolvedSpecifier },
          cause: error,
        });
      }
    }

    throw new RuntimeScaffoldExecutionError({
      message: 'Unsupported TenantProcess reference kind',
      code: 'TENANT_PROCESS_LOAD_FAILED',
      phase: 'tenant-process',
      details: { reference },
    });
  }
}

export function resolveRuntimeReferencePath(referencePath: string, executionPath?: string): string {
  if (path.isAbsolute(referencePath)) {
    return path.normalize(referencePath);
  }
  const baseDirectory = executionPath ? path.dirname(executionPath) : process.cwd();
  return path.resolve(baseDirectory, referencePath);
}

function resolveModuleSpecifier(referencePath: string, executionPath?: string): string {
  if (referencePath.startsWith('.') || path.isAbsolute(referencePath)) {
    return pathToFileURL(resolveRuntimeReferencePath(referencePath, executionPath)).href;
  }
  return referencePath;
}

function selectTenantProcessExport(moduleNamespace: Record<string, unknown>, reference: string): unknown {
  const selected = moduleNamespace.default ?? moduleNamespace.tenantProcess ?? moduleNamespace.runtimeSpineTenantProcess;
  if (selected === undefined) {
    throw new RuntimeScaffoldExecutionError({
      message: `TenantProcess module did not export default, tenantProcess, or runtimeSpineTenantProcess: ${reference}`,
      code: 'TENANT_PROCESS_LOAD_FAILED',
      phase: 'tenant-process',
      details: { reference },
    });
  }
  return selected;
}
