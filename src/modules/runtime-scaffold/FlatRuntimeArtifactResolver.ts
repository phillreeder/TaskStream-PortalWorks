import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { FlowArtifactAccessor, FlowArtifactRecord } from '../../domain/tenantProcess/index.js';

export type FlatRuntimeArtifactSelection = 'artifactId' | 'record' | 'content';

export interface FlatRuntimeArtifactMarker {
  readonly $artifact: {
    readonly ref: string;
    readonly name?: string;
    readonly format?: 'json' | 'text';
    readonly select?: FlatRuntimeArtifactSelection;
    readonly metadata?: Record<string, unknown>;
  };
}

/**
 * Resolves artifact markers embedded anywhere in flat-runtime initial state.
 * Each source is copied into the run's normal artifact store before activation.
 */
export async function resolveFlatRuntimeInitialStateArtifacts(input: {
  readonly initialState: Record<string, unknown>;
  readonly basePath: string;
  readonly artifact: FlowArtifactAccessor;
}): Promise<Record<string, unknown>> {
  return resolveValue(input.initialState, input.basePath, input.artifact) as Promise<Record<string, unknown>>;
}

async function resolveValue(
  value: unknown,
  basePath: string,
  artifact: FlowArtifactAccessor,
): Promise<unknown> {
  if (Array.isArray(value)) {
    return Promise.all(value.map((entry) => resolveValue(entry, basePath, artifact)));
  }

  if (!isRecord(value)) {
    return value;
  }

  if (isArtifactMarker(value)) {
    return resolveArtifactMarker(value, basePath, artifact);
  }

  const resolvedEntries = await Promise.all(
    Object.entries(value).map(async ([key, entry]) => [
      key,
      await resolveValue(entry, basePath, artifact),
    ] as const),
  );
  return Object.fromEntries(resolvedEntries);
}

async function resolveArtifactMarker(
  marker: FlatRuntimeArtifactMarker,
  basePath: string,
  artifact: FlowArtifactAccessor,
): Promise<unknown> {
  const specification = marker.$artifact;
  if (typeof specification.ref !== 'string' || specification.ref.trim() === '') {
    throw new Error('Flat RuntimeScaffold artifact marker requires a non-empty ref');
  }

  const sourcePath = path.isAbsolute(specification.ref)
    ? path.normalize(specification.ref)
    : path.resolve(basePath, specification.ref);
  const format = specification.format ?? (path.extname(sourcePath).toLowerCase() === '.json' ? 'json' : 'text');
  const source = await readFile(sourcePath, 'utf8');
  const content = format === 'json' ? JSON.parse(source) : source;
  const name = specification.name?.trim() || path.basename(sourcePath);
  const saved = await artifact.save({
    name,
    content,
    metadata: {
      sourceRef: specification.ref,
      sourcePath,
      format,
      ...(specification.metadata ?? {}),
    },
  });
  if (saved.status !== 'succeeded' || !saved.value) {
    throw new Error(`Flat RuntimeScaffold failed to seed artifact: ${specification.ref}`);
  }

  return selectArtifactValue(saved.value, specification.select ?? 'artifactId');
}

function selectArtifactValue(
  artifact: FlowArtifactRecord,
  selection: FlatRuntimeArtifactSelection,
): unknown {
  if (selection === 'content') return artifact.content;
  if (selection === 'record') return artifact;
  return artifact.artifactId;
}

function isArtifactMarker(value: unknown): value is FlatRuntimeArtifactMarker {
  return isRecord(value)
    && Object.keys(value).length === 1
    && isRecord(value.$artifact)
    && typeof value.$artifact.ref === 'string';
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
