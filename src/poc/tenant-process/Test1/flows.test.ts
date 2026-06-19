import { describe, expect, it, vi } from 'vitest';
import { prepareWorkFlow } from './flows.js';

describe('IEBBeta Test1 flows', () => {
  it('prepares TenantProcess state without creating a durable work entry', () => {
    const set = vi.fn();
    const result = prepareWorkFlow({
      change: { set },
    } as never, {
      sourceEventId: 'event-1',
      sourceQueueItemId: 'queue-1',
    } as never);

    expect(set).toHaveBeenCalledWith({ path: ['sourceEventId'], value: 'event-1' });
    expect(set).toHaveBeenCalledWith({ path: ['sourceQueueItemId'], value: 'queue-1' });
    expect(set).toHaveBeenCalledWith({ path: ['status'], value: 'prepared' });
    expect(result.result.kind).toBe('test1-work-prepared');
  });
});
