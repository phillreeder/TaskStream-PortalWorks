import type { StateTransitionOperation } from '../../../../../../domain/entities/execution.ts';

const definitions: StateTransitionOperation[] = [
  {
    id: 'sto.taskstream.initialize',
    key: 'sto.taskstream.initialize',
    version: '1.0.0',
    phase: 'execution',
    flowKey: 'flow.taskstream.initialize',
    description: 'Initializes the TaskStream session with deterministic metadata',
  },
];

export const stos: Record<string, StateTransitionOperation> = Object.fromEntries(
  definitions.map((sto) => [sto.key, sto]),
);
