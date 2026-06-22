import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { ExecutionWorkerServiceRuntime } from '../../../services/execution-worker/index.js';

class ProcessDouble extends EventEmitter {
  exitCode?: number;
}

describe('ExecutionWorkerServiceRuntime', () => {
  it('starts once and stops gracefully on SIGTERM', async () => {
    const processRef = new ProcessDouble();
    const service = {
      start: vi.fn(),
      stop: vi.fn(async () => undefined),
    };
    const onStopped = vi.fn();
    const runtime = new ExecutionWorkerServiceRuntime({
      service: service as never,
      processRef: processRef as never,
      onStopped,
    });

    runtime.start();
    runtime.start();
    processRef.emit('SIGTERM');
    await vi.waitFor(() => expect(service.stop).toHaveBeenCalledTimes(1));

    expect(service.start).toHaveBeenCalledTimes(1);
    expect(onStopped).toHaveBeenCalledTimes(1);
  });

  it('loads explicit service configuration through the composition factory', async () => {
    const { createExecutionWorkerMicroservice } = await import('../../../services/execution-worker/index.js');
    const service = createExecutionWorkerMicroservice({
      environment: {
        EXECUTION_WORKER_POOL_ID: 'execution.priority',
        EXECUTION_WORKER_CONCURRENCY: '3',
        EXECUTION_WORKER_POLL_INTERVAL_MS: '50',
      },
    });

    expect(service.pool.poolId).toBe('execution.priority');
    expect(service.pool.size).toBe(3);
    await service.stop();
  });
});
