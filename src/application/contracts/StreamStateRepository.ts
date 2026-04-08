import type { StreamState } from '../../domain/entities/execution.ts';

export interface StreamStateRepository {
  getById(id: string): Promise<StreamState | undefined>;
  getLatestByStreamId(streamId: string): Promise<StreamState | undefined>;
}
