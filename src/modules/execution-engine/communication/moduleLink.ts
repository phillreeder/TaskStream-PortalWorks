import type {
  ExecutionCompletion,
  ExecutionCompletionPublisher,
  ExecutionQueue,
  ExecutionWork,
  ExecutionWorkSubmission,
} from '../../../application/execution/index.js';
import type { ModuleLink, ModuleLinkEnvelope, ModuleLinkRoute } from '../../ModuleLink/index.js';
import { targetRejected } from '../../ModuleLink/index.js';

export const EXECUTION_WORKER_MODULE = 'ExecutionWorker';
export const EXECUTION_WORK_SUBMIT_ACTION = 'execution.work.submit';
export const EXECUTION_COMPLETION_ACTION = 'execution.work.completed';

export function createExecutionWorkSubmissionRoute(queue: ExecutionQueue): ModuleLinkRoute {
  return {
    targetModule: EXECUTION_WORKER_MODULE,
    action: EXECUTION_WORK_SUBMIT_ACTION,
    mode: 'local-handler',
    handler: async (envelope: ModuleLinkEnvelope) => {
      if (!isExecutionWorkSubmission(envelope.payload)) {
        return targetRejected('Invalid execution work submission payload.', {
          code: 'INVALID_EXECUTION_WORK_SUBMISSION',
        });
      }
      return queue.enqueue(envelope.payload);
    },
  };
}

export class ModuleLinkExecutionCompletionPublisher implements ExecutionCompletionPublisher {
  constructor(
    private readonly moduleLink: ModuleLink,
    private readonly targetModule: string,
  ) {}

  async publish(completion: ExecutionCompletion): Promise<void> {
    const delivery = await this.moduleLink.core.deliver({
      sourceModule: EXECUTION_WORKER_MODULE,
      targetModule: this.targetModule,
      action: EXECUTION_COMPLETION_ACTION,
      correlationId: completion.correlationId,
      payload: completion,
      metadata: {
        queueId: completion.queueId,
        poolId: completion.poolId,
        workerId: completion.workerId,
      },
    });
    if (!delivery.ok) {
      throw new Error(`ModuleLink completion delivery failed: ${delivery.error.message}`);
    }
  }
}

export class ModuleLinkExecutionWorkClient {
  constructor(private readonly moduleLink: ModuleLink, private readonly sourceModule: string) {}

  async submit(submission: ExecutionWorkSubmission): Promise<ExecutionWork> {
    const delivery = await this.moduleLink.core.deliver<ExecutionWork>({
      sourceModule: this.sourceModule,
      targetModule: EXECUTION_WORKER_MODULE,
      action: EXECUTION_WORK_SUBMIT_ACTION,
      correlationId: submission.correlationId,
      payload: submission,
      metadata: { queueId: submission.queueId },
    });
    if (!delivery.ok) throw new Error(`ModuleLink execution submission failed: ${delivery.error.message}`);
    return delivery.value;
  }
}

function isExecutionWorkSubmission(value: unknown): value is ExecutionWorkSubmission {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<ExecutionWorkSubmission>;
  const payload = candidate.payload as Partial<ExecutionWorkSubmission['payload']> | undefined;
  return typeof candidate.queueId === 'string'
    && typeof candidate.correlationId === 'string'
    && typeof payload === 'object'
    && payload !== null
    && typeof payload.tenantProcessId === 'string'
    && typeof payload.taskRef === 'string'
    && typeof payload.stoRef === 'string'
    && typeof payload.flowRef === 'string'
    && typeof payload.executionId === 'string'
    && typeof payload.input === 'object'
    && payload.input !== null;
}
