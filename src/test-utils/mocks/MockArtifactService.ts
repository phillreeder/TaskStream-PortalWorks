import { randomUUID } from 'node:crypto';
import type { ArtifactInput, ArtifactRecord, ArtifactReference, ArtifactService } from '../../domain/contracts/artifacts.ts';

export class MockArtifactService implements ArtifactService {
  private readonly store = new Map<string, ArtifactRecord[]>();

  async save(input: ArtifactInput): Promise<ArtifactRecord> {
    const record: ArtifactRecord = {
      ...input,
      id: randomUUID(),
      storedAt: new Date().toISOString(),
      size: typeof input.data === 'string' ? Buffer.byteLength(input.data) : input.data.byteLength,
    };
    const list = this.store.get(input.runId) ?? [];
    list.push(record);
    this.store.set(input.runId, list);
    return record;
  }

  async get(reference: ArtifactReference): Promise<ArtifactRecord | undefined> {
    const list = this.store.get(reference.runId) ?? [];
    return list.find((entry) => entry.id === reference.id);
  }

  async list(runId: string): Promise<ArtifactRecord[]> {
    return [...(this.store.get(runId) ?? [])];
  }
}
