import { ScaffoldExecutionLoader } from './ScaffoldExecutionLoader.js';
import type { RuntimeScaffoldLoadResult } from './types.js';

export interface RuntimeScaffoldOptions {
  readonly executionLoader?: ScaffoldExecutionLoader;
}

export class RuntimeScaffold {
  private readonly executionLoader: ScaffoldExecutionLoader;

  constructor(options: RuntimeScaffoldOptions = {}) {
    this.executionLoader = options.executionLoader ?? new ScaffoldExecutionLoader();
  }

  loadFromControlFile(controlPath: string): Promise<RuntimeScaffoldLoadResult> {
    return this.executionLoader.loadFromControlFile(controlPath);
  }
}
