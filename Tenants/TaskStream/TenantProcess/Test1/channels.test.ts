import { describe, expect, it } from 'vitest';
import { test1ProcessWorkChannel } from './channels.js';

describe('IEBBeta Test1 channel', () => {
  it('selects prepare-work while pending', () => {
    const result = test1ProcessWorkChannel.executable({
      taskRef: 'processWork',
      state: { read: () => 'pending' },
      selectSto: (stoName: string, reason: string) => ({ type: 'sto', stoName, reason }),
    } as never);

    expect(result.stoName).toBe('prepareWork');
  });

  it('selects inspection after preparation', () => {
    const result = test1ProcessWorkChannel.executable({
      taskRef: 'processWork',
      state: { read: () => 'prepared' },
      selectSto: (stoName: string, reason: string) => ({ type: 'sto', stoName, reason }),
    } as never);

    expect(result.stoName).toBe('inspectWork');
  });
});
