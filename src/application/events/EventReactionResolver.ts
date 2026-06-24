export const TASK_ACTIVATION_WORK_TYPE = 'task-activation' as const;
export const TASK_ACTIVATION_INTENT_TYPE = 'planner.activate-task' as const;
export const TASK_ACTIVATION_HANDLER_KEY = 'task-activation.execute' as const;

export const PROCESS_CHANNEL_RESULT_WORK_TYPE = 'process-channel-result' as const;
export const STREAM_PLANNING_INTENT_TYPE = 'planner.process-channel' as const;
export const STREAM_PLANNING_HANDLER_KEY = 'stream-planning.process-channel' as const;

export type SupportedPlannerEventType = 'task.created' | 'stream.ready';

export type EventReaction =
  | {
      readonly id: string;
      readonly eventType: 'task.created';
      readonly queueIntentType: typeof TASK_ACTIVATION_INTENT_TYPE;
      readonly handlerKey: typeof TASK_ACTIVATION_HANDLER_KEY;
      readonly workType: typeof TASK_ACTIVATION_WORK_TYPE;
      readonly createdAt: string;
    }
  | {
      readonly id: string;
      readonly eventType: 'stream.ready';
      readonly queueIntentType: typeof STREAM_PLANNING_INTENT_TYPE;
      readonly handlerKey: typeof STREAM_PLANNING_HANDLER_KEY;
      readonly workType: typeof PROCESS_CHANNEL_RESULT_WORK_TYPE;
      readonly createdAt: string;
    };

export const EVENT_REACTIONS = [
  {
    id: 'reaction.task-created.activate-task',
    eventType: 'task.created',
    queueIntentType: TASK_ACTIVATION_INTENT_TYPE,
    handlerKey: TASK_ACTIVATION_HANDLER_KEY,
    workType: TASK_ACTIVATION_WORK_TYPE,
    createdAt: '2026-06-24T00:00:00.000Z',
  },
  {
    id: 'reaction.stream-ready.process-channel',
    eventType: 'stream.ready',
    queueIntentType: STREAM_PLANNING_INTENT_TYPE,
    handlerKey: STREAM_PLANNING_HANDLER_KEY,
    workType: PROCESS_CHANNEL_RESULT_WORK_TYPE,
    createdAt: '2026-06-24T00:00:00.000Z',
  },
] as const satisfies readonly EventReaction[];

export function resolveEventReaction(eventType: string): EventReaction | null {
  return EVENT_REACTIONS.find((reaction) => reaction.eventType === eventType) ?? null;
}
