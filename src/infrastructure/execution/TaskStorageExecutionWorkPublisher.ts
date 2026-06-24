import type {
  ExecutionWorkPublication,
  ExecutionWorkPublisher,
  PlannerExecutionDispatch,
} from '../../application/planners/ExecutionWorkPublisher.js';
import type { TaskStorageGateway } from '../../application/task-storage/index.js';

export class TaskStorageExecutionWorkPublisher implements ExecutionWorkPublisher {
  constructor(private readonly gateway: TaskStorageGateway) {}

  async publish(dispatch: PlannerExecutionDispatch): Promise<ExecutionWorkPublication> {
    const entry = await this.gateway.createProcessWorkEntry({
      sourceEventId: dispatch.sourceEventId,
      sourceQueueItemId: dispatch.sourceQueueItemId,
      tenantProcessId: dispatch.tenantProcessId,
      channelId: dispatch.channelRef,
      flowId: dispatch.flowRef,
      executionId: dispatch.executionId,
      workType: dispatch.workType,
      status: 'queued',
      payload: {
        taskRef: dispatch.taskRef,
        stoRef: dispatch.stoRef,
        requestId: dispatch.requestId,
        reason: dispatch.reason,
        flowParams: dispatch.flowParams,
        sourceTaskId: dispatch.sourceTaskId,
        sourceTaskName: dispatch.sourceTaskName,
        sourceEventId: dispatch.sourceEventId,
        sourceQueueItemId: dispatch.sourceQueueItemId,
        correlationId: dispatch.correlationId,
        ...(dispatch.streamId ? { streamId: dispatch.streamId } : {}),
        ...(dispatch.planningEvidence ? { planningEvidence: dispatch.planningEvidence } : {}),
      },
    });

    return { id: entry.id, status: entry.status };
  }
}
