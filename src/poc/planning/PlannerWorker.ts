import { randomUUID } from 'node:crypto';
import { TASK_PLANNING_HANDLER_KEY, resolvePocEventReaction } from '../events/EventReactionResolver.js';
import { SystemTraceRecorder, type SystemTraceAdapter, type SystemTraceRecord } from '../../modules/SystemTrace/index.js';
import { POC_TENANT_PROCESS_IDS, PocTenantProcessRuntime } from '../tenant-process/PocTenantProcess.js';
import type {
  PersistentQueueItem,
  StoredEvent,
  TaskStorageGateway,
} from '../tenant-process/Test1/task-storage/index.js';

export type ProcessChannelPlanner = {
  resolve(tenantProcessId: string): unknown;
  invokeProcessChannel(input: {
    event: StoredEvent;
    queueItem: PersistentQueueItem;
    sourceTaskId: string;
    correlationId: string;
  }): Promise<{ workEntry: { id: string } }>;
};

export class PlannerWorker {
  private readonly tenantProcessRuntime: ProcessChannelPlanner;
  private readonly traceRecorder: SystemTraceRecorder;

  public constructor(
    private readonly workerId: string,
    private readonly gateway: TaskStorageGateway,
    tenantProcessRuntime?: ProcessChannelPlanner,
    traceRecorder?: SystemTraceRecorder,
  ) {
    this.traceRecorder = traceRecorder ?? new SystemTraceRecorder({ adapter: new GatewaySystemTraceAdapter(gateway) });
    this.tenantProcessRuntime = tenantProcessRuntime ?? new PocTenantProcessRuntime(gateway, this.traceRecorder);
  }

  public async runOnce(): Promise<PersistentQueueItem | null> {
    const item = await this.gateway.claimNextPersistentQueueItem(this.workerId);
    if (!item) return null;

    const correlationId = randomUUID();

    try {
      const event = await this.loadSourceEvent(item);
      const context = this.traceContext(event, item, correlationId);
      await this.trace('poc.planner.queue-item.claimed', 'Queue item claimed', context);
      this.validateHandler(event, item);
      await this.trace('poc.planner.tenantprocess.resolution.started', 'TenantProcess resolution started', context);
      this.tenantProcessRuntime.resolve(POC_TENANT_PROCESS_IDS.tenantProcessId);
      await this.trace('poc.planner.tenantprocess.resolved', 'TenantProcess resolved', context);
      await this.trace('poc.planner.tenantprocess.invocation.started', 'TenantProcess invocation requested by planner', context);
      const result = await this.tenantProcessRuntime.invokeProcessChannel({
        event,
        queueItem: item,
        sourceTaskId: event.sourceEntityId,
        correlationId,
      });
      if (!result.workEntry.id) {
        throw new Error(`TenantProcess invocation did not return a durable work entry for queue item: ${item.id}`);
      }
      const durableWorkEntry = (await this.gateway.listProcessWorkEntries()).find(
        (entry) => entry.id === result.workEntry.id && entry.sourceQueueItemId === item.id,
      );
      if (!durableWorkEntry) {
        throw new Error(`TenantProcess invocation did not durably create work entry: ${result.workEntry.id}`);
      }
      const completed = await this.gateway.completePersistentQueueItem(item.id);
      await this.trace(
        'poc.planner.queue-item.completed',
        'Queue item completed after TenantProcess work persistence',
        { ...context, workEntryId: result.workEntry.id },
      );
      return completed;
    } catch (error) {
      await this.traceRecorder.trace({
        operation: 'poc.planner.failure',
        phase: 'ERROR',
        severity: 'error',
        status: 'error',
        correlationId,
        message: error instanceof Error ? error.message : 'Unknown planner failure.',
        component: 'PlannerWorker',
        context: {
          correlationId,
          sourceEventId: item.sourceEventId,
          sourceQueueItemId: item.id,
          tenantProcessId: POC_TENANT_PROCESS_IDS.tenantProcessId,
        },
      });
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

  private validateHandler(event: StoredEvent, item: PersistentQueueItem): void {
    const reaction = resolvePocEventReaction(event.eventType);
    if (!reaction || reaction.id !== item.eventReactionId || reaction.handlerKey !== item.handlerKey) {
      throw new Error(`No matching event reaction handler for queue item: ${item.id}`);
    }

    if (item.handlerKey !== TASK_PLANNING_HANDLER_KEY) {
      throw new Error(`Unsupported queue handler: ${item.handlerKey}`);
    }
  }

  private traceContext(event: StoredEvent, item: PersistentQueueItem, correlationId: string): Record<string, string> {
    return {
      correlationId,
      sourceTaskId: event.sourceEntityId,
      sourceEventId: event.id,
      sourceQueueItemId: item.id,
      tenantProcessId: POC_TENANT_PROCESS_IDS.tenantProcessId,
    };
  }

  private async trace(operation: string, message: string, context: Record<string, string>): Promise<void> {
    await this.traceRecorder.trace({
      operation,
      phase: 'POINT',
      severity: 'info',
      status: 'ok',
      correlationId: context.correlationId,
      message,
      component: 'PlannerWorker',
      context,
    });
  }
}

export class GatewaySystemTraceAdapter implements SystemTraceAdapter {
  public constructor(private readonly gateway: TaskStorageGateway) {}

  public async append(record: SystemTraceRecord): Promise<void> {
    await this.gateway.appendSystemTraceRecord(record as unknown as Record<string, unknown>);
  }

  public async flush(): Promise<void> {}
}
