import { describe, expect, it } from 'vitest';
import { channel } from '../channel.js';

describe('channel', () => {
  it('selects an STO by authored name through the injected Channel context', () => {
    const executable = channel((ctx) => ctx.selectSto('prepareWork', 'Work is pending.'));

    const result = executable({
      taskRef: 'task.test',
      state: { read: () => undefined },
      selectSto: (stoName, reason) => ({ type: 'sto', stoName, reason }),
    });

    expect(result).toEqual({
      type: 'sto',
      stoName: 'prepareWork',
      reason: 'Work is pending.',
    });
  });
});
