import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type { FlatRuntimePathwayResult } from './FlatRuntimePathway.js';
import { FlatRuntimeFileStore } from './FlatRuntimeStore.js';
import { createZipArchive, type ZipEntry } from './zip.js';

export interface FlatRuntimeFailureEvidenceInput {
  readonly runtimeRoot: string;
  readonly result: Pick<
    FlatRuntimePathwayResult,
    'runId' | 'cycleId' | 'taskRef' | 'status' | 'reason' | 'runDirectory' | 'streamResults'
  >;
  readonly configId: string;
  readonly controlPath: string;
  readonly configPath: string;
  readonly warnings: readonly string[];
}

/**
 * Packages a non-successful flat RuntimeScaffold Run for transfer.
 *
 * This is deliberately scaffold-generic: it snapshots the selected command
 * and config, records the surfaced result summary, and includes every partial
 * Run file already produced. TenantProcess-specific evidence remains ordinary
 * files inside the Run and is included without interpretation.
 */
export async function createFlatRuntimeFailureEvidence(
  input: FlatRuntimeFailureEvidenceInput,
): Promise<string> {
  const store = new FlatRuntimeFileStore(input.runtimeRoot);
  const archiveName = `flat-runtime-${input.result.runId}-${input.result.status}-evidence.zip`;

  await store.saveRunFile(
    input.result.runId,
    'diagnostics/failure-summary.json',
    `${JSON.stringify({
      generatedAt: new Date().toISOString(),
      configId: input.configId,
      controlPath: input.controlPath,
      configPath: input.configPath,
      runId: input.result.runId,
      cycleId: input.result.cycleId,
      taskRef: input.result.taskRef,
      status: input.result.status,
      reason: input.result.reason ?? null,
      warnings: input.warnings,
      streams: input.result.streamResults.map((stream) => ({
        streamId: stream.streamId,
        unitId: stream.unitId,
        status: stream.status,
        stepCount: stream.stepCount,
        reason: stream.reason ?? null,
      })),
    }, null, 2)}\n`,
  );
  await store.saveRunFile(
    input.result.runId,
    'diagnostics/control.snapshot.json',
    await readFile(input.controlPath),
  );
  await store.saveRunFile(
    input.result.runId,
    'diagnostics/config.snapshot.json',
    await readFile(input.configPath),
  );

  const entries = await collectRunEntries(input.result.runDirectory);
  return store.saveRunFile(
    input.result.runId,
    `exports/${archiveName}`,
    createZipArchive(entries),
  );
}

async function collectRunEntries(root: string): Promise<readonly ZipEntry[]> {
  const files = await listFiles(root);
  const entries: ZipEntry[] = [];

  for (const filePath of files) {
    const fileStat = await stat(filePath);
    entries.push({
      name: relative(root, filePath).replaceAll('\\', '/'),
      content: await readFile(filePath),
      modifiedAt: fileStat.mtime,
    });
  }

  return entries;
}

async function listFiles(root: string): Promise<readonly string[]> {
  const files: string[] = [];
  const visit = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const entryPath = join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(entryPath);
      } else if (entry.isFile() && !entry.name.includes('.tmp-')) {
        files.push(entryPath);
      }
    }
  };
  await visit(root);
  return files;
}
