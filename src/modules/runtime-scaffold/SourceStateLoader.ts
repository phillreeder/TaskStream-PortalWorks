import { RuntimeScaffoldExecutionError } from './errors.js';
import { cloneJson } from './json.js';
import { NodeRuntimeScaffoldFileSystem } from './ScaffoldExecutionLoader.js';
import { resolveRuntimeReferencePath } from './TenantProcessLoader.js';
import type { RuntimeScaffoldFileSystem, RuntimeScaffoldLoadSuccess } from './types.js';

export interface SourceStateLoaderOptions {
  readonly fileSystem?: RuntimeScaffoldFileSystem;
  readonly sourceStateFixtures?: Readonly<Record<string, unknown>>;
}

export class SourceStateLoader {
  private readonly fileSystem: RuntimeScaffoldFileSystem;
  private readonly sourceStateFixtures: Readonly<Record<string, unknown>>;

  constructor(options: SourceStateLoaderOptions = {}) {
    this.fileSystem = options.fileSystem ?? new NodeRuntimeScaffoldFileSystem();
    this.sourceStateFixtures = options.sourceStateFixtures ?? {};
  }

  async load(load: RuntimeScaffoldLoadSuccess): Promise<unknown> {
    const sourceStateRef = load.descriptor.sourceStateRef;

    if (sourceStateRef.kind === 'inline') {
      return cloneJson(sourceStateRef.value);
    }

    if (sourceStateRef.kind === 'fixture') {
      if (Object.prototype.hasOwnProperty.call(this.sourceStateFixtures, sourceStateRef.ref)) {
        return cloneJson(this.sourceStateFixtures[sourceStateRef.ref]);
      }
      throw new RuntimeScaffoldExecutionError({
        message: `Source state fixture not found: ${sourceStateRef.ref}`,
        code: 'SOURCE_STATE_NOT_FOUND',
        phase: 'source-state',
        details: { sourceStateRef },
      });
    }

    const sourcePath = resolveRuntimeReferencePath(sourceStateRef.ref, load.executionPath);
    try {
      return JSON.parse(await this.fileSystem.readTextFile(sourcePath));
    } catch (error) {
      throw new RuntimeScaffoldExecutionError({
        message: `Unable to load source state file: ${sourcePath}`,
        code: 'SOURCE_STATE_LOAD_FAILED',
        phase: 'source-state',
        path: sourcePath,
        details: { sourceStateRef },
        cause: error,
      });
    }
  }
}
