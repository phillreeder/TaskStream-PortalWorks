export type StateMutationType = 'set' | 'unset' | 'append' | 'merge' | 'increment';

export interface StateMutation {
  readonly type: StateMutationType;
  readonly path: string;
  readonly value?: unknown;
}

export interface StateChangeBatch {
  readonly id: string;
  readonly createdAt: string;
  readonly changes: readonly StateMutation[];
}

export interface StateWriter {
  queue(change: StateMutation): void;
  queueMany(changes: readonly StateMutation[]): void;
  pending(): readonly StateMutation[];
  flush(): Promise<StateChangeBatch>;
  reset(): void;
  isDirty(): boolean;
}
