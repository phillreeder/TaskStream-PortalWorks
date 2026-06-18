export const PROCESS_CHANNEL_RESULT_WORK_TYPE = 'process-channel-result' as const;
export const TASK_PLANNING_INTENT_TYPE = 'planner.process-channel' as const;
export const TASK_PLANNING_HANDLER_KEY = 'task-planning.process-channel' as const;

export type SupportedTaskEventType = 'task.created' | 'task.updated';

export type PocEventReaction = {
  readonly id: string;
  readonly eventType: SupportedTaskEventType;
  readonly queueIntentType: typeof TASK_PLANNING_INTENT_TYPE;
  readonly handlerKey: typeof TASK_PLANNING_HANDLER_KEY;
  readonly workType: typeof PROCESS_CHANNEL_RESULT_WORK_TYPE;
  readonly createdAt: string;
};

export const POC_EVENT_REACTIONS = [
  {
    id: 'reaction.task-created.process-channel',
    eventType: 'task.created',
    queueIntentType: TASK_PLANNING_INTENT_TYPE,
    handlerKey: TASK_PLANNING_HANDLER_KEY,
    workType: PROCESS_CHANNEL_RESULT_WORK_TYPE,
    createdAt: '2026-06-18T00:00:00.000Z',
  },
  {
    id: 'reaction.task-updated.process-channel',
    eventType: 'task.updated',
    queueIntentType: TASK_PLANNING_INTENT_TYPE,
    handlerKey: TASK_PLANNING_HANDLER_KEY,
    workType: PROCESS_CHANNEL_RESULT_WORK_TYPE,
    createdAt: '2026-06-18T00:00:00.000Z',
  },
] as const satisfies readonly PocEventReaction[];

export function resolvePocEventReaction(eventType: string): PocEventReaction | null {
  return POC_EVENT_REACTIONS.find((reaction) => reaction.eventType === eventType) ?? null;
}
