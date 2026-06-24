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
import type { ExecutionWorkPublisher } from './ExecutionWorkPublisher.js';
import {
  TenantProcessPlanningPipeline,
  type TenantProcessPlanningStreamStateProvider,
} from './TenantProcessPlanningPipeline.js';

export class PlannerWorker {
  private readonly tenantProcessExplorer: TenantProcessExplorer;
  private readonly tenantProcessLoader: TenantProcessLoader;
  private readonly traceRecorder: SystemTraceRecorder;

  public constructor(
    public readonly workerId: string,
    private readonly gateway: TaskStorageGateway,
    private readonly executionWorkPublisher: ExecutionWorkPublisher,
    tenantProcessExplorer: TenantProcessExplorer,
    tenantProcessLoader: TenantProcessLoader,
    private readonly streamStateProvider: TenantProcessPlanningStreamStateProvider,
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
      sourceTaskId: item.sourceTaskId,
      sourceTaskName: item.taskName,
      taskRef: item.taskRef,
    };

    try {
      const event = await this.loadSourceEvent(item);
      const reaction = this.validateHandler(event, item);
      const context = this.traceContext(event, item, correlationId, reaction);
      failureContext = context;
      await this.trace('planner.queue-item.claimed', 'Queue item claimed', context);
      await this.trace('planner.tenantprocess.discovery.started', 'TenantProcess discovery started', context);
      const discoveries = await this.tenantProcessExplorer.discover();
      await this.trace('planner.tenantprocess.discovery.completed', 'TenantProcess discovery completed', {
        ...context,
        discoveredTenantProcessCount: String(discoveries.length),
      });
      const planning = new TenantProcessPlanningPipeline({
        queueItem: item,
        sourceEvent: event,
        loader: this.tenantProcessLoader,
        streamStateProvider: this.streamStateProvider,
      });

      await this.trace('planner.tenantprocess.loading.started', 'TenantProcess loading started', context);
      const resolution = await planning.loadTenantProcess();
      const resolvedContext = this.resolvedTraceContext(context, resolution);
      failureContext = resolvedContext;
      await this.trace('planner.tenantprocess.loaded', 'TenantProcess module loaded', resolvedContext);
      await this.trace('planner.tenantprocess.resolved', 'TenantProcess identity verified', resolvedContext);

      planning.resolveTask();
      planning.resolveChannel();
      await planning.loadStreamState();
      planning.createChannelContext();
      planning.invokeChannel();
      planning.resolveAndValidateSto();
      planning.resolveFlow();

      const dispatch = planning.createExecutionDispatch({
        correlationId,
        tenantProcessId: resolution.resolvedTenantProcessId,
        workType: reaction.queueIntentType,
      });
      const dispatchContext = {
        ...resolvedContext,
        taskRef: dispatch.taskRef,
        channelRef: dispatch.channelRef,
        stoRef: dispatch.stoRef,
        flowRef: dispatch.flowRef,
        executionId: dispatch.executionId,
        streamKey: dispatch.planningEvidence.streamKey,
        planningContractId: dispatch.planningEvidence.planningContractId,
        plannedStateVersion: String(dispatch.planningEvidence.effectiveVersion),
      };
      await this.trace('planner.channel.entered', 'TenantProcess channel selected governed work', dispatchContext);
      const publication = await this.executionWorkPublisher.publish(dispatch);
      await this.trace('planner.execution-work.published', 'Governed execution work published', {
        ...dispatchContext,
        workEntryId: publication.id,
        workEntryStatus: publication.status,
      });
      const completed = await this.gateway.completePersistentQueueItem(item.id);
      await this.trace('planner.queue-item.completed', 'Planner queue item completed after execution dispatch', {
        ...dispatchContext,
        workEntryId: publication.id,
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
        'planner.queue-item.failed',
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
      sourceTaskId: item.sourceTaskId,
      sourceTaskName: item.taskName,
      taskRef: item.taskRef,
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
        operation: 'planner.tenantprocess.loading.failed',
        message: error.message,
      };
    }
    return {
      code: 'PLANNER_FAILURE',
      stage: 'planner',
      operation: 'planner.failure',
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
