import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  FlowArtifactReferenceFormat,
  FlowArtifactResolveInput,
} from '../../domain/tenantProcess/index.js';
import type { JsonObject, JsonValue } from '../../domain/tenantProcess/types.js';

export interface FlatRuntimeResolvedArtifact {
  readonly name: string;
  readonly content: JsonValue | string;
  readonly metadata: JsonObject;
}

/**
 * Resolves one artifact reference when a Flow explicitly asks for it through
 * ctx.artifact.resolve(). RuntimeScaffold never walks or rewrites initial state.
 */
export async function resolveFlatRuntimeArtifactReference(
  input: FlowArtifactResolveInput,
  basePath: string,
): Promise<FlatRuntimeResolvedArtifact> {
  const reference = input.ref.trim();
  if (!reference) {
    throw new Error('Flat RuntimeScaffold artifact reference requires a non-empty ref');
  }

  const sourcePath = path.isAbsolute(reference)
    ? path.normalize(reference)
    : path.resolve(basePath, reference);
  const format = input.format ?? inferFormat(sourcePath);
  const source = await readFile(sourcePath, 'utf8');
  const content = format === 'json' ? JSON.parse(source) as JsonValue : source;

  return {
    name: input.name?.trim() || path.basename(sourcePath),
    content,
    metadata: {
      sourceRef: input.ref,
      sourcePath,
      format,
      ...(input.metadata ?? {}),
    },
  };
}

function inferFormat(sourcePath: string): FlowArtifactReferenceFormat {
  return path.extname(sourcePath).toLowerCase() === '.json' ? 'json' : 'text';
}
