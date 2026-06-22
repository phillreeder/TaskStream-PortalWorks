import type { ExecutionOutcome, ExecutionService, ExecutionWork } from '../../application/execution/index.js';

export interface FlowExecutor {
  execute(work: ExecutionWork): Promise<ExecutionOutcome>;
}

export class FlowExecutionService implements ExecutionService {
  constructor(private readonly executor: FlowExecutor) {}

  execute(work: ExecutionWork): Promise<ExecutionOutcome> {
    return this.executor.execute(work);
  }
}

export class UnavailableFlowExecutor implements FlowExecutor {
  async execute(work: ExecutionWork): Promise<ExecutionOutcome> {
    return {
      status: 'failed',
      code: 'FLOW_EXECUTOR_UNAVAILABLE',
      reason: `No FlowExecutor implementation is configured for ${work.payload.tenantProcessId}.${work.payload.flowRef}.`,
      metadata: {
        executionId: work.payload.executionId,
      },
    };
  }
}
