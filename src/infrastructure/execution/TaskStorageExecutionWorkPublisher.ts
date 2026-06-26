import type {
  ExecutionWorkPublication,
  ExecutionWorkPublisher,
  PlannerExecutionDispatch,
} from '../../application/planners/ExecutionWorkPublisher.js';
import type { TaskStorageGateway } from '../../application/task-storage/index.js';

export class TaskStorageExecutionWorkPublisher implements ExecutionWorkPublisher {
  constructor(private readonly gateway: TaskStorageGateway) {}

  async publish(dispatch: PlannerExecutionDispatch): Promise<ExecutionWorkPublication> {
    const streamExecution = dispatch.executionKind === 'stream-flow';
    const entry = await this.gateway.createProcessWorkEntry({
      sourceEventId: dispatch.sourceEventId,
      sourceQueueItemId: dispatch.sourceQueueItemId,
      tenantProcessId: dispatch.tenantProcessId,
      executionKind: dispatch.executionKind,
      channelId: streamExecution ? dispatch.channelRef : null,
      flowId: dispatch.flowRef,
      executionId: dispatch.executionId,
      workType: dispatch.workType,
      status: 'queued',
      payload: {
        executionKind: dispatch.executionKind,
        taskRef: dispatch.taskRef,
        requestId: dispatch.requestId,
        reason: dispatch.reason,
        sourceTaskId: dispatch.sourceTaskId,
        sourceTaskName: dispatch.sourceTaskName,
        sourceEventId: dispatch.sourceEventId,
        sourceQueueItemId: dispatch.sourceQueueItemId,
        correlationId: dispatch.correlationId,
        ...(streamExecution ? {
          stoRef: dispatch.stoRef,
          streamId: dispatch.streamId,
          planningEvidence: dispatch.planningEvidence,
        } : {
          flowParams: dispatch.flowParams,
        }),
      },
    });

    return { id: entry.id, status: entry.status };
  }
}
