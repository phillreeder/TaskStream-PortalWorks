import type { StateChangeBatch, StateMutation, StateWriter } from '../../domain/contracts/stateWriter.ts';

export class MockStateWriter implements StateWriter {
  private readonly queued: StateMutation[] = [];
  private flushes: StateChangeBatch[] = [];

  queue(change: StateMutation): void {
    this.queued.push(change);
  }

  queueMany(changes: StateMutation[]): void {
    this.queued.push(...changes);
  }

  pending(): readonly StateMutation[] {
    return this.queued;
  }

  async flush(): Promise<StateChangeBatch> {
    const batch: StateChangeBatch = {
      id: `mock-batch-${this.flushes.length + 1}`,
      createdAt: new Date().toISOString(),
      changes: [...this.queued],
    };
    this.flushes.push(batch);
    this.queued.length = 0;
    return batch;
  }

  reset(): void {
    this.queued.length = 0;
    this.flushes = [];
  }

  isDirty(): boolean {
    return this.queued.length > 0;
  }

  history(): readonly StateChangeBatch[] {
    return this.flushes;
  }
}
