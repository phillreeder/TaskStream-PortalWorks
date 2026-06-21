import { describe, expect, it, vi } from 'vitest';
import { inspectWorkFlow, prepareWorkFlow } from './flows.js';

describe('IEBBeta Test1 flows', () => {
  it('prepares TenantProcess state without creating a durable work entry', async () => {
    const set = vi.fn();
    const result = await prepareWorkFlow({
      change: { set },
    } as never, {
      sourceEventId: 'event-1',
      sourceQueueItemId: 'queue-1',
    } as never);

    expect(set).toHaveBeenCalledWith({ path: ['sourceEventId'], value: 'event-1' });
    expect(set).toHaveBeenCalledWith({ path: ['sourceQueueItemId'], value: 'queue-1' });
    expect(set).toHaveBeenCalledWith({ path: ['status'], value: 'prepared' });
    expect(result).toEqual({ status: 'succeeded' });
  });

  it('requests a system retry when inspection prerequisites are not yet satisfied', async () => {
    const retry = vi.fn((options) => ({ status: 'retry', ...options }));
    const result = await inspectWorkFlow({
      probe: (_name: string, evaluate: () => boolean) => evaluate(),
      state: {
        get: () => 'pending',
      },
      retry,
    } as never);

    expect(retry).toHaveBeenCalledWith({
      reason: 'work is not prepared',
      afterSeconds: 60,
    });
    expect(result).toEqual({
      status: 'retry',
      reason: 'work is not prepared',
      afterSeconds: 60,
    });
  });

});
