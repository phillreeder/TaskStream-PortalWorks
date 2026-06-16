import { randomUUID } from 'node:crypto';
import type { StateChangeBatch, StateMutation, StateWriter } from '../../domain/contracts/stateWriter.js';

export interface BufferedStateWriterOptions {
  clock?: () => string;
}

const now = () => new Date().toISOString();

export class BufferedStateWriter implements StateWriter {
  private readonly queueEntries: StateMutation[] = [];
  private readonly clock: () => string;

  constructor(options: BufferedStateWriterOptions = {}) {
    this.clock = options.clock ?? now;
  }

  queue(change: StateMutation): void {
    this.queueEntries.push(change);
  }

  queueMany(changes: StateMutation[]): void {
    for (const change of changes) {
      this.queue(change);
    }
  }

  pending(): readonly StateMutation[] {
    return this.queueEntries;
  }

  async flush(): Promise<StateChangeBatch> {
    const changes = [...this.queueEntries];
    this.queueEntries.length = 0;
    return {
      id: randomUUID(),
      createdAt: this.clock(),
      changes,
    };
  }

  reset(): void {
    this.queueEntries.length = 0;
  }

  isDirty(): boolean {
    return this.queueEntries.length > 0;
  }
}
