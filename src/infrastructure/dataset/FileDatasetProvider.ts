import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { DatasetEnvelope, DatasetProvider, DatasetRequest, DatasetScope } from '../../domain/contracts/dataset.js';

export interface FileDatasetProviderOptions {
  baseDir?: string;
  defaultScope?: DatasetScope;
  clock?: () => string;
}

const now = () => new Date().toISOString();

interface FileDatasetShape {
  key?: string;
  version?: string;
  scope?: DatasetScope;
  referenceId?: string;
  data: unknown;
}

const ensureArray = <T>(value: T | T[]): T[] => (Array.isArray(value) ? value : [value]);

export class FileDatasetProvider implements DatasetProvider {
  private readonly baseDir: string;
  private readonly defaultScope: DatasetScope;
  private readonly clock: () => string;

  constructor(options: FileDatasetProviderOptions = {}) {
    this.baseDir = options.baseDir ?? path.join(process.cwd(), 'datasets');
    this.defaultScope = options.defaultScope ?? 'task';
    this.clock = options.clock ?? now;
  }

  async resolve<TData = unknown>(request: DatasetRequest): Promise<DatasetEnvelope<TData>> {
    const record = await this.readDatasetFile(request.key);
    const scope = request.scope ?? record.scope ?? this.defaultScope;
    const version = request.version ?? record.version ?? 'latest';
    const referenceId = request.referenceId ?? record.referenceId;

    return {
      key: request.key,
      version,
      scope,
      referenceId,
      data: record.data as TData,
      retrievedAt: this.clock(),
    };
  }

  async list(scope?: DatasetScope): Promise<DatasetEnvelope<unknown>[]> {
    const fileNames = await this.listDatasetFiles();
    const envelopes: DatasetEnvelope<unknown>[] = [];
    for (const file of fileNames) {
      const key = file.replace(/\.json$/i, '');
      const record = await this.readDatasetFile(key);
      const resolvedScope = record.scope ?? this.defaultScope;
      if (scope && resolvedScope !== scope) {
        continue;
      }
      envelopes.push({
        key,
        version: record.version ?? 'latest',
        scope: resolvedScope,
        referenceId: record.referenceId,
        data: record.data,
        retrievedAt: this.clock(),
      });
    }
    return envelopes;
  }

  private async readDatasetFile(key: string): Promise<FileDatasetShape> {
    const filePath = path.join(this.baseDir, `${key}.json`);
    const contents = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(contents);
    if (Array.isArray(parsed)) {
      return { data: ensureArray(parsed) };
    }
    if (!parsed || typeof parsed !== 'object') {
      return { data: parsed };
    }
    const { data, ...rest } = parsed as FileDatasetShape & { data?: unknown };
    return {
      ...rest,
      data: data ?? parsed,
    };
  }

  private async listDatasetFiles(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.baseDir);
      return files.filter((file) => file.endsWith('.json'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }
}
