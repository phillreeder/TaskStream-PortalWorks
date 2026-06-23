import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { createPlannerService, PlannerServiceRuntime } from '../index.js';

class ProcessDouble extends EventEmitter {
  exitCode?: number;
}

describe('PlannerServiceRuntime', () => {
  it('starts once and stops gracefully on SIGTERM', async () => {
    const processRef = new ProcessDouble();
    const service = {
      start: vi.fn(),
      stop: vi.fn(async () => undefined),
    };
    const onStopped = vi.fn();
    const runtime = new PlannerServiceRuntime({
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

  it('loads explicit pool configuration through the composition factory', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'taskstream-planner-service-'));
    try {
      const service = await createPlannerService({
        environment: {
          PLANNER_POOL_ID: 'planner.priority',
          PLANNER_CONCURRENCY: '3',
          PLANNER_POLL_INTERVAL_MS: '50',
          PLANNER_DATABASE_PATH: join(directory, 'tasks.sqlite'),
          PLANNER_TENANT_PROCESS_ROOT: fileURLToPath(new URL('../../../../Tenants/', import.meta.url)),
          PLANNER_DEFAULT_TENANT_PROCESS_ID: 'TaskStream/Test1',
        },
        workerIdFactory: (index) => `planner-test-${index + 1}`,
      });

      expect(service.pool.poolId).toBe('planner.priority');
      expect(service.pool.size).toBe(3);
      expect(service.validatedTenantProcessIds).toContain('TaskStream/Test1');
      await service.stop();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
