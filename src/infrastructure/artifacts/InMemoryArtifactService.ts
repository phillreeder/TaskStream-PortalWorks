import { randomUUID } from 'node:crypto';
import type { ArtifactInput, ArtifactRecord, ArtifactReference, ArtifactService } from '../../domain/contracts/artifacts.ts';

export interface InMemoryArtifactServiceOptions {
  clock?: () => string;
}

const now = () => new Date().toISOString();

export class InMemoryArtifactService implements ArtifactService {
  private readonly byRun = new Map<string, ArtifactRecord[]>();
  private readonly clock: () => string;

  constructor(options: InMemoryArtifactServiceOptions = {}) {
    this.clock = options.clock ?? now;
  }

  async save(input: ArtifactInput): Promise<ArtifactRecord> {
    const buffer = typeof input.data === 'string' ? Buffer.from(input.data) : Buffer.from(input.data);
    const record: ArtifactRecord = {
      ...input,
      id: randomUUID(),
      storedAt: this.clock(),
      size: buffer.byteLength,
      data: buffer.toString('base64'),
    };

    const list = this.byRun.get(input.runId) ?? [];
    list.push(record);
    this.byRun.set(input.runId, list);
    return record;
  }

  async get(reference: ArtifactReference): Promise<ArtifactRecord | undefined> {
    const records = this.byRun.get(reference.runId);
    return records?.find((entry) => entry.id === reference.id);
  }

  async list(runId: string): Promise<ArtifactRecord[]> {
    return [...(this.byRun.get(runId) ?? [])];
  }
}
