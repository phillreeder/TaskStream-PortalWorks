import { describe, expect, it, vi } from 'vitest';
import type { PersistentQueueItem } from '../../task-storage/index.js';
import { PlannerWorkerPool } from '../PlannerWorkerPool.js';

function queueItem(id: string): PersistentQueueItem {
  return {
    id,
    sourceEventId: `event-${id}`,
    tenantProcessId: 'TaskStream/Test1',
    eventReactionId: 'reaction',
    intentType: 'plan',
    handlerKey: 'planner',
    status: 'completed',
    attemptCount: 1,
    availableAt: new Date(0).toISOString(),
    claimedBy: 'worker',
    claimedAt: new Date(0).toISOString(),
    completedAt: new Date(0).toISOString(),
    failedAt: null,
    lastError: null,
    createdAt: new Date(0).toISOString(),
  };
}

describe('PlannerWorkerPool', () => {
  it('constructs the configured worker pool and returns available work results', async () => {
    const workerIds: string[] = [];
    const pool = new PlannerWorkerPool({
      poolId: 'planner.default',
      concurrency: 2,
      workerIdFactory: (index) => `planner-${index + 1}`,
      workerFactory: (workerId, index) => {
        workerIds.push(workerId);
        return {
          workerId,
          runOnce: vi.fn(async () => index === 0 ? queueItem('one') : null),
        };
      },
    });

    const results = await pool.runAvailableOnce();

    expect(pool.size).toBe(2);
    expect(workerIds).toEqual(['planner-1', 'planner-2']);
    expect(results.map((item) => item.id)).toEqual(['one']);
  });

  it('rejects invalid concurrency before workers are created', () => {
    expect(() => new PlannerWorkerPool({
      poolId: 'planner.invalid',
      concurrency: 0,
      workerFactory: () => ({ workerId: 'never', runOnce: async () => null }),
    })).toThrow('PlannerWorkerPool concurrency must be a positive integer.');
  });
});
