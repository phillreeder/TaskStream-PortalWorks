import { randomUUID } from 'node:crypto';
import { TASK_PLANNING_HANDLER_KEY, resolveEventReaction } from '../events/EventReactionResolver.js';
import { SystemTraceRecorder, type SystemTraceAdapter } from '../../modules/SystemTrace/index.js';
import {
  TenantProcessLoadError,
  TenantProcessLoader,
  type TenantProcessResolution,
} from '../../infrastructure/tenant-process/TenantProcessLoader.js';
import { TenantProcessExplorer } from '../../infrastructure/tenant-process/TenantProcessExplorer.js';
import type {
  PersistentQueueItem,
  StoredEvent,
  TaskStorageGateway,
} from '../task-storage/index.js';

export class PlannerWorker {
  private readonly tenantProcessExplorer: TenantProcessExplorer;
  private readonly tenantProcessLoader: TenantProcessLoader;
  private readonly traceRecorder: SystemTraceRecorder;

  public constructor(
    private readonly workerId: string,
    private readonly gateway: TaskStorageGateway,
    tenantProcessExplorer: TenantProcessExplorer,
    tenantProcessLoader: TenantProcessLoader,
    traceRecorder?: SystemTraceRecorder,
  ) {
    this.traceRecorder = traceRecorder ?? new SystemTraceRecorder({ adapter: new NoopSystemTraceAdapter() });
    this.tenantProcessExplorer = tenantProcessExplorer;
    this.tenantProcessLoader = tenantProcessLoader;
  }

  public async runOnce(): Promise<PersistentQueueItem | null> {
    const item = await this.gateway.claimNextPersistentQueueItem(this.workerId);
    if (!item) return null;

    const correlationId = randomUUID();
    let failureContext: Record<string, string> = {
      correlationId,
      sourceEventId: item.sourceEventId,
      sourceQueueItemId: item.id,
      requestedTenantProcessId: item.tenantProcessId,
      tenantProcessId: item.tenantProcessId,
      workerId: this.workerId,
    };

    try {
      const event = await this.loadSourceEvent(item);
      const reaction = this.validateHandler(event, item);
      const context = this.traceContext(event, item, correlationId, reaction);
      failureContext = context;
      await this.trace('poc.planner.queue-item.claimed', 'Queue item claimed', context);
      await this.trace('poc.planner.tenantprocess.discovery.started', 'TenantProcess discovery started', context);
      const discoveries = await this.tenantProcessExplorer.discover();
      await this.trace('poc.planner.tenantprocess.discovery.completed', 'TenantProcess discovery completed', {
        ...context,
        discoveredTenantProcessCount: String(discoveries.length),
      });
      await this.trace('poc.planner.tenantprocess.loading.started', 'TenantProcess loading started', context);
      const resolution = await this.tenantProcessLoader.load({ tenantProcessId: item.tenantProcessId });
      const resolvedContext = this.resolvedTraceContext(context, resolution);
      failureContext = resolvedContext;
      await this.trace('poc.planner.tenantprocess.loaded', 'TenantProcess module loaded', resolvedContext);
      await this.trace('poc.planner.tenantprocess.resolved', 'TenantProcess identity verified', resolvedContext);
      const dispatch = this.resolveDispatch(resolution, event, item);
      const dispatchContext = {
        ...resolvedContext,
        taskRef: dispatch.taskRef,
        channelRef: dispatch.channelRef,
        stoRef: dispatch.stoRef,
        flowRef: dispatch.flowRef,
        executionId: dispatch.executionId,
      };
      await this.trace('poc.tenantprocess.channel.entered', 'TenantProcess channel selected governed work', dispatchContext);
      const workEntry = await this.gateway.createProcessWorkEntry({
        sourceEventId: event.id,
        sourceQueueItemId: item.id,
        tenantProcessId: resolution.resolvedTenantProcessId,
        channelId: dispatch.channelRef,
        flowId: dispatch.flowRef,
        executionId: dispatch.executionId,
        workType: reaction.queueIntentType,
        status: 'queued',
        payload: {
          taskRef: dispatch.taskRef,
          stoRef: dispatch.stoRef,
          requestId: dispatch.requestId,
          reason: dispatch.reason,
          flowParams: dispatch.flowParams,
          sourceTaskId: event.sourceEntityId,
          sourceEventId: event.id,
          sourceQueueItemId: item.id,
        },
      });
      await this.trace('poc.tenantprocess.work-entry.confirmed', 'Governed execution work entry created', {
        ...dispatchContext,
        workEntryId: workEntry.id,
        workEntryStatus: workEntry.status,
      });
      const completed = await this.gateway.completePersistentQueueItem(item.id);
      await this.trace('poc.planner.queue-item.completed', 'Planner queue item completed after execution dispatch', {
        ...dispatchContext,
        workEntryId: workEntry.id,
        queueStatus: completed.status,
      });
      return completed;
    } catch (error) {
      const failure = this.failureDetails(error);
      const failedContext = {
        ...failureContext,
        failureCode: failure.code,
        failureStage: failure.stage,
      };
      await this.traceRecorder.trace({
        operation: failure.operation,
        phase: 'ERROR',
        severity: 'error',
        status: 'error',
        correlationId,
        message: failure.message,
        component: 'PlannerWorker',
        context: failedContext,
      });
      const failed = await this.gateway.failPersistentQueueItem(item.id, `${failure.code}: ${failure.message}`);
      await this.traceFailure(
        'poc.planner.queue-item.failed',
        'Queue item failed before governed execution dispatch',
        {
          ...failedContext,
          queueStatus: failed.status,
        },
      );
      throw error;
    }
  }

  private async loadSourceEvent(item: PersistentQueueItem): Promise<StoredEvent> {
    const event = await this.gateway.getEvent(item.sourceEventId);
    if (!event) throw new Error(`Source event not found for queue item: ${item.id}`);
    return event;
  }

  private validateHandler(event: StoredEvent, item: PersistentQueueItem): NonNullable<ReturnType<typeof resolveEventReaction>> {
    const reaction = resolveEventReaction(event.eventType);
    if (!reaction || reaction.id !== item.eventReactionId || reaction.handlerKey !== item.handlerKey) {
      throw new Error(`No matching event reaction handler for queue item: ${item.id}`);
    }

    if (item.handlerKey !== TASK_PLANNING_HANDLER_KEY) {
      throw new Error(`Unsupported queue handler: ${item.handlerKey}`);
    }
    return reaction;
  }

  private traceContext(
    event: StoredEvent,
    item: PersistentQueueItem,
    correlationId: string,
    reaction: NonNullable<ReturnType<typeof resolveEventReaction>>,
  ): Record<string, string> {
    return {
      correlationId,
      sourceTaskId: event.sourceEntityId,
      sourceEventId: event.id,
      sourceQueueItemId: item.id,
      tenantProcessId: item.tenantProcessId,
      requestedTenantProcessId: item.tenantProcessId,
      workerId: this.workerId,
      eventReactionId: reaction.id,
      intentType: reaction.queueIntentType,
      handlerKey: reaction.handlerKey,
    };
  }

  private resolvedTraceContext(
    context: Record<string, string>,
    resolution: TenantProcessResolution,
  ): Record<string, string> {
    return {
      ...context,
      loaderKey: resolution.loaderKey,
      requestedTenantProcessId: resolution.requestedTenantProcessId,
      resolvedTenantProcessId: resolution.resolvedTenantProcessId,
    };
  }

  private resolveDispatch(
    resolution: TenantProcessResolution,
    event: StoredEvent,
    item: PersistentQueueItem,
  ): {
    taskRef: string;
    channelRef: string;
    stoRef: string;
    flowRef: string;
    executionId: string;
    requestId: string;
    reason?: string;
    flowParams?: Record<string, unknown>;
  } {
    const tenantProcess = resolution.tenantProcess as unknown as {
      readonly name: string;
      readonly tasks: Record<string, {
        readonly stateDefinition: { readonly defaults?: Record<string, unknown> };
        readonly channel?: { readonly executable: (context: any) => { readonly stoName: string; readonly reason?: string } };
        readonly stos: Record<string, { readonly flow: unknown }>;
      }>;
      readonly channels: Record<string, unknown>;
      readonly stos: Record<string, { readonly flow: unknown }>;
    };

    const taskEntries = Object.entries(tenantProcess.tasks);
    if (taskEntries.length !== 1) {
      throw new Error(`POC planner requires exactly one Task in ${tenantProcess.name}; found ${taskEntries.length}.`);
    }

    const [taskRef, task] = taskEntries[0];
    if (!task.channel) {
      throw new Error(`Task ${taskRef} does not declare a Channel for planning.`);
    }

    const channelEntry = Object.entries(tenantProcess.channels).find(([, channel]) => channel === task.channel);
    if (!channelEntry) {
      throw new Error(`Task ${taskRef} references a Channel outside the TenantProcess channel collection.`);
    }
    const [channelRef] = channelEntry;

    const defaults = task.stateDefinition.defaults;
    if (!defaults) {
      throw new Error(`Task ${taskRef} references a StateDefinition without defaults.`);
    }

    const allowedStos = Object.entries(task.stos);
    const request = task.channel.executable({
      taskRef,
      state: {
        read: (path: string) => defaults[path],
        snapshot: () => ({ ...defaults }),
      },
      params: {
        sourceTaskId: event.sourceEntityId,
        sourceEventId: event.id,
        sourceQueueItemId: item.id,
      },
      selectSto: (stoName: string, reason: string) => ({ type: 'sto', stoName, reason }),
    });

    const selectedEntry = allowedStos.find(([stoName]) => stoName === request.stoName);
    if (!selectedEntry) {
      throw new Error(`Channel ${channelRef} selected STO name ${request.stoName} outside Task ${taskRef}.`);
    }
    const [stoRef, sto] = selectedEntry;
    if (tenantProcess.stos[stoRef] !== sto) {
      throw new Error(`Task ${taskRef} STO ${stoRef} is not the registered TenantProcess STO object.`);
    }
    if (typeof sto.flow?.executable !== 'function') {
      throw new Error(`Selected STO ${stoRef} does not contain an executable Flow.`);
    }

    return {
      taskRef,
      channelRef,
      stoRef,
      flowRef: stoRef,
      executionId: randomUUID(),
      requestId: randomUUID(),
      reason: request.reason,
    };
  }

  private failureDetails(error: unknown): {
    code: string;
    stage: string;
    operation: string;
    message: string;
  } {
    if (error instanceof TenantProcessLoadError) {
      return {
        code: error.code,
        stage: 'tenantprocess-load',
        operation: 'poc.planner.tenantprocess.loading.failed',
        message: error.message,
      };
    }
    return {
      code: 'POC_PLANNER_FAILURE',
      stage: 'planner',
      operation: 'poc.planner.failure',
      message: error instanceof Error ? error.message : 'Unknown planner failure.',
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

  private async traceFailure(operation: string, message: string, context: Record<string, string>): Promise<void> {
    await this.traceRecorder.trace({
      operation,
      phase: 'ERROR',
      severity: 'error',
      status: 'error',
      correlationId: context.correlationId,
      message,
      component: 'PlannerWorker',
      context,
    });
  }
}

class NoopSystemTraceAdapter implements SystemTraceAdapter {
  public async append(): Promise<void> {}
  public async flush(): Promise<void> {}
}
