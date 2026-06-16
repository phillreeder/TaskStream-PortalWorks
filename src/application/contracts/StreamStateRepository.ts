import type { StreamState } from '../../domain/entities/execution.js';

export interface StreamStateRepository {
  getLatestByStreamId(streamId: string): Promise<StreamState | undefined>;
}
