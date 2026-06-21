import { RUNTIME_SPINE_TENANT_PROCESS_IDS } from './ids.js';

export const reviewSubmissionChannel = (ctx: { readonly taskRef: string; readonly state: { read(path: string): unknown } }) => {
  const status = ctx.state.read('status');

  if (status === 'pending') {
    return {
      requestId: RUNTIME_SPINE_TENANT_PROCESS_IDS.requests.startReview,
      taskRef: ctx.taskRef,
      channelRef: RUNTIME_SPINE_TENANT_PROCESS_IDS.channel,
      selectedStoRef: RUNTIME_SPINE_TENANT_PROCESS_IDS.stos.startReview,
      flowParams: {
        reviewerId: 'channel-selected-reviewer',
      },
      reason: 'Review submission is pending and should enter review.',
    };
  }

  if (status === 'in_review') {
    return {
      requestId: RUNTIME_SPINE_TENANT_PROCESS_IDS.requests.autoDecision,
      taskRef: ctx.taskRef,
      channelRef: RUNTIME_SPINE_TENANT_PROCESS_IDS.channel,
      selectedStoRef: RUNTIME_SPINE_TENANT_PROCESS_IDS.stos.autoDecision,
      reason: 'Review submission is active and ready for automatic decision.',
    };
  }

  return {
    requestId: RUNTIME_SPINE_TENANT_PROCESS_IDS.requests.summarizeReview,
    taskRef: ctx.taskRef,
    channelRef: RUNTIME_SPINE_TENANT_PROCESS_IDS.channel,
    selectedStoRef: RUNTIME_SPINE_TENANT_PROCESS_IDS.stos.summarizeReview,
    reason: 'Review submission is terminal and should produce a summary.',
  };
};
