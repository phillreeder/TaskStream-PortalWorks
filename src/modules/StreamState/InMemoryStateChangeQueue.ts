import type { StateChangeQueue, StreamKey, VerifiedStateChange } from './types.js';

export class InMemoryStateChangeQueue implements StateChangeQueue {
  private readonly changesByStream = new Map<StreamKey, VerifiedStateChange[]>();

  enqueue(change: VerifiedStateChange): void {
    const streamChanges = this.changesByStream.get(change.streamKey) ?? [];
    streamChanges.push(change);
    streamChanges.sort(compareChanges);
    this.changesByStream.set(change.streamKey, dedupeChanges(streamChanges));
  }

  peek(streamKey: StreamKey): readonly VerifiedStateChange[] {
    return [...(this.changesByStream.get(streamKey) ?? [])];
  }

  drain(streamKey: StreamKey): readonly VerifiedStateChange[] {
    const changes = this.peek(streamKey);
    this.changesByStream.delete(streamKey);
    return changes;
  }
}

function compareChanges(left: VerifiedStateChange, right: VerifiedStateChange): number {
  if (left.order !== right.order) {
    return left.order - right.order;
  }
  return left.changeId.localeCompare(right.changeId);
}

function dedupeChanges(changes: readonly VerifiedStateChange[]): VerifiedStateChange[] {
  const byId = new Map<string, VerifiedStateChange>();
  for (const change of changes) {
    byId.set(change.changeId, change);
  }
  return [...byId.values()].sort(compareChanges);
}
