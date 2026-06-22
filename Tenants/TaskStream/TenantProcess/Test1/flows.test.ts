import { describe, expect, it, vi } from 'vitest';
import { inspectWorkFlow, prepareWorkFlow } from './flows.js';

const unavailable = async () => ({ status: 'unavailable' as const, reason: 'not configured' });

function createExampleAccessors() {
  return {
    artifact: {
      save: vi.fn(unavailable),
      get: vi.fn(unavailable),
      list: vi.fn(unavailable),
    },
    unit: {
      create: vi.fn(unavailable),
      get: vi.fn(unavailable),
      list: vi.fn(unavailable),
      update: vi.fn(unavailable),
      remove: vi.fn(unavailable),
    },
    http: {
      request: vi.fn(unavailable),
      get: vi.fn(unavailable),
      post: vi.fn(unavailable),
      put: vi.fn(unavailable),
      patch: vi.fn(unavailable),
      remove: vi.fn(unavailable),
    },
  };
}

describe('IEBBeta Test1 flows', () => {
  it('prepares state and tolerates unavailable example accessors', async () => {
    const set = vi.fn();
    const accessors = createExampleAccessors();
    const result = await prepareWorkFlow({
      taskRef: 'processWork',
      stoRef: 'prepareWork',
      state: { get: vi.fn() },
      change: { set },
      probe: (_name: string, evaluate: () => boolean) => evaluate(),
      success: (_result: unknown, options: unknown) => ({ status: 'succeeded', ...(options as object) }),
      retry: vi.fn(),
      fail: vi.fn(),
      ...accessors,
    } as never, {
      sourceEventId: 'event-1',
      sourceQueueItemId: 'queue-1',
    } as never);

    expect(set).toHaveBeenCalledWith({ path: ['sourceEventId'], value: 'event-1' });
    expect(set).toHaveBeenCalledWith({ path: ['sourceQueueItemId'], value: 'queue-1' });
    expect(set).toHaveBeenCalledWith({ path: ['status'], value: 'prepared' });
    expect(accessors.artifact.save).toHaveBeenCalledOnce();
    expect(accessors.unit.create).toHaveBeenCalledOnce();
    expect(accessors.http.post).toHaveBeenCalledOnce();
    expect(result).toEqual({
      status: 'succeeded',
      metadata: {
        exampleAccessors: {
          artifact: 'unavailable',
          unit: 'unavailable',
          http: 'unavailable',
        },
      },
    });
  });

  it('requests a system retry before loading accessors when work is not prepared', async () => {
    const retry = vi.fn((options) => ({ status: 'retry', ...options }));
    const accessors = createExampleAccessors();
    const result = await inspectWorkFlow({
      probe: (_name: string, evaluate: () => boolean) => evaluate(),
      state: { get: () => 'pending' },
      retry,
      ...accessors,
    } as never);

    expect(retry).toHaveBeenCalledWith({
      reason: 'work is not prepared',
      afterSeconds: 60,
    });
    expect(accessors.artifact.list).not.toHaveBeenCalled();
    expect(accessors.unit.list).not.toHaveBeenCalled();
    expect(accessors.http.get).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: 'retry',
      reason: 'work is not prepared',
      afterSeconds: 60,
    });
  });
});
