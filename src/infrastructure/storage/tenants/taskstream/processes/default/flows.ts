import type { FlowActionDefinition, FlowDefinition } from '../../../../../../domain/entities/execution.ts';

const queueHandshake: FlowActionDefinition = {
  key: 'action.taskstream.queue-handshake',
  description: 'Queues a deterministic handshake token on the stream state',
  async run({ ctx }) {
    ctx.logger.info('Queueing taskstream handshake token');
    ctx.stateWriter.queue({ type: 'set', path: 'session.handshake', value: 'taskstream-demo-handshake' });
    return { status: 'success', message: 'handshake queued' };
  },
};

const ensureReady: FlowActionDefinition = {
  key: 'action.taskstream.ensure-ready',
  description: 'Marks the stream as run-ready',
  async run({ ctx }) {
    ctx.stateWriter.queue({ type: 'set', path: 'session.status.ready', value: true });
    return { status: 'success', message: 'session marked ready' };
  },
};

const definitions: FlowDefinition[] = [
  {
    key: 'flow.taskstream.initialize',
    name: 'TaskStream Initialize Flow',
    description: 'Prepares deterministic session metadata for downstream execution',
    actions: [queueHandshake, ensureReady],
  },
];

export const flows: Record<string, FlowDefinition> = Object.fromEntries(definitions.map((flow) => [flow.key, flow]));
