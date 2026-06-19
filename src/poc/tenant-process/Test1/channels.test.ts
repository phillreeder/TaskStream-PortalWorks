import { describe, expect, it } from 'vitest';
import { IEBBETA_TEST1_TENANT_PROCESS_IDS } from './ids.js';
import { test1ProcessWorkChannel } from './channels.js';

describe('IEBBeta Test1 channel', () => {
  it('selects the governed prepare-work STO while pending', () => {
    const result = test1ProcessWorkChannel({
      taskRef: IEBBETA_TEST1_TENANT_PROCESS_IDS.task,
      state: {
        read: () => 'pending',
      },
    } as never);

    expect(result.selectedStoRef).toBe(IEBBETA_TEST1_TENANT_PROCESS_IDS.stos.prepareWork);
    expect(result.channelRef).toBe(IEBBETA_TEST1_TENANT_PROCESS_IDS.channel);
  });

  it('selects inspection after preparation', () => {
    const result = test1ProcessWorkChannel({
      taskRef: IEBBETA_TEST1_TENANT_PROCESS_IDS.task,
      state: {
        read: () => 'prepared',
      },
    } as never);

    expect(result.selectedStoRef).toBe(IEBBETA_TEST1_TENANT_PROCESS_IDS.stos.inspectWork);
  });
});
