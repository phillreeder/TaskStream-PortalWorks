import {
  PROCESS_CHANNEL_RESULT_WORK_TYPE,
  TASK_PLANNING_HANDLER_KEY,
  resolvePocEventReaction,
} from '../events/EventReactionResolver.js';
import type {
  PersistentQueueItem,
  StoredEvent,
  TaskStorageGateway,
} from '../../tenants/IEBBeta/TenantProcesses/Test1/task-storage/index.js';

export type ProcessChannelPlanner = {
  executeProcessChannel(input: {
    event: StoredEvent;
    queueItem: PersistentQueueItem;
  }): Promise<{ processAction: string }>;
};

export class PlannerWorker {
  public constructor(
    private readonly workerId: string,
    private readonly gateway: TaskStorageGateway,
    private readonly planner: ProcessChannelPlanner,
  ) {}

  public async runOnce(): Promise<PersistentQueueItem | null> {
    const item = await this.gateway.claimNextPersistentQueueItem(this.workerId);
    if (!item) return null;

    try {
      const event = await this.loadSourceEvent(item);
      const result = await this.invokeHandler(event, item);
      await this.gateway.createProcessWorkEntry({
        sourceEventId: event.id,
        sourceQueueItemId: item.id,
        workType: PROCESS_CHANNEL_RESULT_WORK_TYPE,
        status: 'materialized',
        payload: {
          processAction: result.processAction,
          unresolvedDownstreamAction: 'start-flow-or-process-flow-undecided',
          sourceEventType: event.eventType,
          sourceEntityType: event.sourceEntityType,
          sourceEntityId: event.sourceEntityId,
        },
      });
      return await this.gateway.completePersistentQueueItem(item.id);
    } catch (error) {
      await this.gateway.failPersistentQueueItem(
        item.id,
        error instanceof Error ? error.message : 'Unknown planner failure.',
      );
      throw error;
    }
  }

  private async loadSourceEvent(item: PersistentQueueItem): Promise<StoredEvent> {
    const event = await this.gateway.getEvent(item.sourceEventId);
    if (!event) throw new Error(`Source event not found for queue item: ${item.id}`);
    return event;
  }

  private async invokeHandler(
    event: StoredEvent,
    item: PersistentQueueItem,
  ): Promise<{ processAction: string }> {
    const reaction = resolvePocEventReaction(event.eventType);
    if (!reaction || reaction.id !== item.eventReactionId || reaction.handlerKey !== item.handlerKey) {
      throw new Error(`No matching event reaction handler for queue item: ${item.id}`);
    }

    if (item.handlerKey !== TASK_PLANNING_HANDLER_KEY) {
      throw new Error(`Unsupported queue handler: ${item.handlerKey}`);
    }

    return this.planner.executeProcessChannel({ event, queueItem: item });
  }
}

export class PocProcessChannelPlanner implements ProcessChannelPlanner {
  public async executeProcessChannel(): Promise<{ processAction: string }> {
    return { processAction: 'process-channel-outcome-pending-flow-decision' };
  }
}
