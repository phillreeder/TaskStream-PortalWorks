import { appendFile, mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type {
  MissionStreamState,
  MissionTaskState,
  SalesMissionProcessState,
} from './mission-model.js';

export type MissionRecordScope =
  | { readonly kind: 'process' }
  | { readonly kind: 'task'; readonly taskRef: string };

export interface MissionJournalEntry {
  readonly timestamp: string;
  readonly event: string;
  readonly processRef: string;
  readonly taskRef?: string;
  readonly streamRef?: string;
  readonly recordRef?: string;
  readonly data?: unknown;
}

/**
 * Temporary sidecar persistence for RuntimeScaffold mission experiments.
 *
 * It mirrors ProcessState, TaskState and StreamState without changing the
 * current RuntimeScaffold pathway or pretending that this filesystem layout
 * is the final TaskStream persistence model.
 */
export class MissionStateFileStore {
  constructor(private readonly root: string) {}

  processStatePath(): string {
    return join(this.root, 'process', 'state.json');
  }

  taskStatePath(taskRef: string): string {
    return join(this.root, 'tasks', safePathSegment(taskRef), 'state.json');
  }

  streamStatePath(streamRef: string): string {
    return join(this.root, 'streams', safePathSegment(streamRef), 'state.json');
  }

  async saveProcessState(state: SalesMissionProcessState): Promise<void> {
    await this.writeJson(this.processStatePath(), state);
  }

  async readProcessState(): Promise<SalesMissionProcessState> {
    return this.readJson<SalesMissionProcessState>(this.processStatePath());
  }

  async saveTaskState(state: MissionTaskState): Promise<void> {
    await this.writeJson(this.taskStatePath(state.taskRef), state);
  }

  async readTaskState<T extends MissionTaskState>(taskRef: T['taskRef']): Promise<T> {
    return this.readJson<T>(this.taskStatePath(taskRef));
  }

  async saveStreamState(state: MissionStreamState): Promise<void> {
    await this.writeJson(this.streamStatePath(state.streamRef), state);
  }

  async readStreamState<T extends MissionStreamState>(streamRef: string): Promise<T> {
    return this.readJson<T>(this.streamStatePath(streamRef));
  }

  async upsertRecord<T>(
    scope: MissionRecordScope,
    collection: string,
    recordKey: string,
    record: T,
  ): Promise<void> {
    await this.writeJson(this.recordPath(scope, collection, recordKey), record);
  }

  async readRecord<T>(
    scope: MissionRecordScope,
    collection: string,
    recordKey: string,
  ): Promise<T> {
    return this.readJson<T>(this.recordPath(scope, collection, recordKey));
  }

  async listRecords<T>(scope: MissionRecordScope, collection: string): Promise<readonly T[]> {
    const directory = this.recordDirectory(scope, collection);
    let names: string[];
    try {
      names = await readdir(directory);
    } catch (error) {
      if (isMissingPathError(error)) return [];
      throw error;
    }

    const records: T[] = [];
    for (const name of names.filter((entry) => entry.endsWith('.json')).sort()) {
      records.push(await this.readJson<T>(join(directory, name)));
    }
    return records;
  }

  async appendJournal(entry: MissionJournalEntry): Promise<void> {
    const path = join(this.root, 'journal.ndjson');
    await mkdir(dirname(path), { recursive: true });
    await appendFile(path, `${JSON.stringify(entry)}\n`, 'utf8');
  }

  private recordPath(
    scope: MissionRecordScope,
    collection: string,
    recordKey: string,
  ): string {
    return join(this.recordDirectory(scope, collection), `${safePathSegment(recordKey)}.json`);
  }

  private recordDirectory(scope: MissionRecordScope, collection: string): string {
    if (scope.kind === 'process') {
      return join(this.root, 'process', 'records', safePathSegment(collection));
    }
    return join(
      this.root,
      'tasks',
      safePathSegment(scope.taskRef),
      'records',
      safePathSegment(collection),
    );
  }

  private async readJson<T>(path: string): Promise<T> {
    const text = await readFile(path, 'utf8');
    return JSON.parse(text) as T;
  }

  private async writeJson(path: string, value: unknown): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    const temporaryPath = `${path}.tmp-${process.pid}-${Date.now()}`;
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await rename(temporaryPath, path);
  }
}

function safePathSegment(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error('Mission state path segment must be non-empty');
  return encodeURIComponent(trimmed);
}

function isMissingPathError(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && (error as { readonly code?: unknown }).code === 'ENOENT';
}
