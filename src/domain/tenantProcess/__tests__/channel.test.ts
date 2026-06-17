import { describe, expect, it } from 'vitest';
import { channel } from '../channel.js';

describe('channel', () => {
  it('provides the contextual Channel shape and preserves the executable', () => {
    const executable = channel((ctx) => ({
      requestId: 'request.test',
      taskRef: ctx.taskRef,
      channelRef: 'channel.test',
      selectedStoRef: 'sto.test',
    }));

    expect(
      executable({
        taskRef: 'task.test',
        state: {
          read: () => undefined,
        },
      }),
    ).toEqual({
      requestId: 'request.test',
      taskRef: 'task.test',
      channelRef: 'channel.test',
      selectedStoRef: 'sto.test',
    });
  });
});
