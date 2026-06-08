import { RuntimeScaffold } from './RuntimeScaffold.js';
import type { RuntimeScaffoldLoadResult } from './types.js';

export async function loadRuntimeScaffoldFromControlFile(controlPath: string): Promise<RuntimeScaffoldLoadResult> {
  return new RuntimeScaffold().loadFromControlFile(controlPath);
}
