import { appendFile, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, normalize, relative } from 'node:path';
import type { FlowArtifactRecord, FlowUnitRecord } from '../../domain/tenantProcess/index.js';

export type FlatRuntimeStatus = 'activating' | 'running' | 'succeeded' | 'blocked' | 'failed';

export interface FlatRuntimeRunRecord {
  readonly runId: string;
  readonly tenantProcess: string;
  readonly taskRef: string;
  readonly status: FlatRuntimeStatus;
  readonly cycleId: string;
  readonly unitIds: readonly string[];
  readonly streamIds: readonly string[];
  readonly startedAt: string;
  readonly updatedAt: string;
  readonly reason?: string;
}

export interface FlatRuntimeCycleRecord {
  readonly cycleId: string;
  readonly runId: string;
  readonly taskRef: string;
  readonly status: FlatRuntimeStatus;
  readonly unitIds: readonly string[];
  readonly streamIds: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface FlatRuntimeStoredUnit extends FlowUnitRecord {
  readonly runId: string;
  readonly cycleId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface FlatRuntimeStreamRecord {
  readonly streamId: string;
  readonly runId: string;
  readonly cycleId: string;
  readonly taskRef: string;
  readonly unitId: string;
  readonly status: 'ready' | 'running' | 'succeeded' | 'blocked' | 'failed';
  readonly stepCount: number;
  readonly lastStoRef?: string;
  readonly lastFlowRef?: string;
  readonly reason?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface FlatRuntimeStoredArtifact extends FlowArtifactRecord {
  readonly runId: string;
  readonly cycleId: string;
  readonly streamId?: string;
  readonly createdAt: string;
}

export interface FlatRuntimeTraceRecord {
  readonly timestamp: string;
  readonly runId: string;
  readonly phase: string;
  readonly event: string;
  readonly cycleId?: string;
  readonly unitId?: string;
  readonly streamId?: string;
  readonly taskRef?: string;
  readonly stoRef?: string;
  readonly flowRef?: string;
  readonly data?: unknown;
}

/**
 * The sole persistence adapter for the flat RuntimeScaffold pathway.
 * Definitions and executable functions stay in memory; runtime records are
 * persisted as inspectable JSON/NDJSON files below one run directory.
 */
export class FlatRuntimeFileStore {
  constructor(private readonly runtimeRoot: string) {}

  runDirectory(runId: string): string {
    return join(this.runtimeRoot, 'runs', runId);
  }

  async saveRun(record: FlatRuntimeRunRecord): Promise<void> {
    await this.writeJson(join(this.runDirectory(record.runId), 'run.json'), record);
  }

  async saveCycle(record: FlatRuntimeCycleRecord): Promise<void> {
    await this.writeJson(join(this.runDirectory(record.runId), 'cycles', `${record.cycleId}.json`), record);
  }

  async saveUnit(record: FlatRuntimeStoredUnit): Promise<void> {
    await this.writeJson(join(this.runDirectory(record.runId), 'units', `${record.unitId}.json`), record);
  }

  async removeUnit(runId: string, unitId: string): Promise<void> {
    await rm(join(this.runDirectory(runId), 'units', `${unitId}.json`), { force: true });
  }

  async saveStream(record: FlatRuntimeStreamRecord): Promise<void> {
    await this.writeJson(join(this.runDirectory(record.runId), 'streams', record.streamId, 'stream.json'), record);
  }

  async saveStreamState(runId: string, streamId: string, state: unknown): Promise<void> {
    await this.writeJson(join(this.runDirectory(runId), 'streams', streamId, 'state.json'), state);
  }

  async saveArtifact(record: FlatRuntimeStoredArtifact): Promise<void> {
    await this.writeJson(join(this.runDirectory(record.runId), 'artifacts', `${record.artifactId}.json`), record);
  }

  runFilePath(runId: string, relativePath: string): string {
    const root = this.runDirectory(runId);
    const target = normalize(join(root, relativePath));
    const fromRoot = relative(root, target);
    if (fromRoot.startsWith('..') || isAbsolute(fromRoot)) {
      throw new Error(`Flat RuntimeScaffold run path escapes run directory: ${relativePath}`);
    }
    return target;
  }

  async saveRunFile(runId: string, relativePath: string, content: string | Buffer): Promise<string> {
    const target = this.runFilePath(runId, relativePath);
    await mkdir(dirname(target), { recursive: true });
    const temporaryPath = `${target}.tmp-${process.pid}-${Date.now()}`;
    await writeFile(temporaryPath, content);
    await rename(temporaryPath, target);
    return target;
  }

  async appendTrace(record: FlatRuntimeTraceRecord): Promise<void> {
    const path = join(this.runDirectory(record.runId), 'trace.ndjson');
    await mkdir(dirname(path), { recursive: true });
    await appendFile(path, `${JSON.stringify(record)}\n`, 'utf8');
  }

  private async writeJson(path: string, value: unknown): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    const temporaryPath = `${path}.tmp-${process.pid}-${Date.now()}`;
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await rename(temporaryPath, path);
  }
}
