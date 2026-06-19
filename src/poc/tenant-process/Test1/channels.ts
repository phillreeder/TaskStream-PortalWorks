import { channel } from '../../../domain/tenantProcess/index.js';
import { IEBBETA_TEST1_TENANT_PROCESS_IDS } from './ids.js';

export const test1ProcessWorkChannel = channel((ctx) => {
  const status = ctx.state.read('status');

  if (status === 'pending') {
    return {
      requestId: IEBBETA_TEST1_TENANT_PROCESS_IDS.requests.prepareWork,
      taskRef: ctx.taskRef,
      channelRef: IEBBETA_TEST1_TENANT_PROCESS_IDS.channel,
      selectedStoRef: IEBBETA_TEST1_TENANT_PROCESS_IDS.stos.prepareWork,
      reason: 'The Test1 work request is pending and must be prepared by its TenantProcess.',
    };
  }

  return {
    requestId: IEBBETA_TEST1_TENANT_PROCESS_IDS.requests.inspectWork,
    taskRef: ctx.taskRef,
    channelRef: IEBBETA_TEST1_TENANT_PROCESS_IDS.channel,
    selectedStoRef: IEBBETA_TEST1_TENANT_PROCESS_IDS.stos.inspectWork,
    reason: 'The Test1 work request has left pending state and should be inspected.',
  };
});
