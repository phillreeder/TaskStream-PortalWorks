import { describe, expect, it } from 'vitest';
import { ModuleLink } from '../../ModuleLink/index.js';
import { ModuleLinkExecutionWorkClient } from '../communication/moduleLink.js';
import type { FlowExecutor } from '../FlowExecutor.js';
import { ExecutionWorkerMicroservice } from '../../../services/execution-worker/index.js';

const submission = {
  queueId: 'execution.default',
  correlationId: 'correlation-1',
  payload: {
    tenantProcessId: 'TaskStream/Test1',
    taskRef: 'task.prepare',
    stoRef: 'sto.prepare',
    flowRef: 'flow.prepare',
    executionId: 'execution-1',
    input: { sourceTaskId: 'task-1' },
  },
};

describe('ExecutionWorkerMicroservice', () => {
  it('accepts work through ModuleLink and processes it through the worker pool', async () => {
    const moduleLink = new ModuleLink();
    const executor: FlowExecutor = {
      execute: async (work) => ({ status: 'succeeded', result: { executionId: work.payload.executionId } }),
    };
    const service = new ExecutionWorkerMicroservice({ moduleLink, flowExecutor: executor });
    const client = new ModuleLinkExecutionWorkClient(moduleLink, 'PlannerWorker');

    const work = await client.submit(submission);
    const completions = await service.pool.runAvailableOnce();

    expect(work.queueId).toBe('execution.default');
    expect(completions).toHaveLength(1);
    expect(completions[0]?.outcome.status).toBe('succeeded');
  });

  it('converts a thrown executor error into a governed failure without throwing from the worker', async () => {
    const moduleLink = new ModuleLink();
    const executor: FlowExecutor = { execute: async () => { throw new Error('boom'); } };
    const service = new ExecutionWorkerMicroservice({ moduleLink, flowExecutor: executor });
    const client = new ModuleLinkExecutionWorkClient(moduleLink, 'PlannerWorker');

    await client.submit(submission);
    const completions = await service.pool.runAvailableOnce();

    expect(completions[0]?.outcome).toMatchObject({
      status: 'failed',
      code: 'EXECUTION_SERVICE_THROWN',
      reason: 'boom',
    });
  });

  it('keeps the Flow executor replaceable while the default skeleton fails cleanly', async () => {
    const moduleLink = new ModuleLink();
    const service = new ExecutionWorkerMicroservice({ moduleLink });
    const client = new ModuleLinkExecutionWorkClient(moduleLink, 'PlannerWorker');

    await client.submit(submission);
    const completions = await service.pool.runAvailableOnce();

    expect(completions[0]?.outcome).toMatchObject({
      status: 'failed',
      code: 'FLOW_EXECUTOR_UNAVAILABLE',
    });
  });
});
