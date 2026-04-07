export type StateMutation =
  | { type: 'set'; path: string; value: unknown }
  | { type: 'merge'; path: string; value: Record<string, unknown> }
  | { type: 'remove'; path: string };

export interface StateChangeBatch {
  readonly id: string;
  readonly createdAt: string;
  readonly changes: readonly StateMutation[];
}

export interface StateWriter {
  queue(change: StateMutation): void;
  queueMany(changes: StateMutation[]): void;
  pending(): readonly StateMutation[];
  flush(): Promise<StateChangeBatch>;
  reset(): void;
  isDirty(): boolean;
}
