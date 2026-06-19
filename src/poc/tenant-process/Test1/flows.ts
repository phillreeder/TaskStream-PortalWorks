import { flow } from '../../../domain/tenantProcess/index.js';

export const prepareWorkFlow = flow((ctx, input) => {
  ctx.change.set({
    path: ['sourceEventId'],
    value: input.sourceEventId,
  });

  ctx.change.set({
    path: ['sourceQueueItemId'],
    value: input.sourceQueueItemId,
  });

  ctx.change.set({
    path: ['status'],
    value: 'prepared',
  });

  return {
    status: 'succeeded',
    result: {
      kind: 'test1-work-prepared',
      sourceEventId: input.sourceEventId,
      sourceQueueItemId: input.sourceQueueItemId,
    },
  };
});

export const inspectWorkFlow = flow((ctx) => ({
  status: 'succeeded',
  result: {
    kind: 'test1-work-inspection',
    workStatus: ctx.state.get({ path: ['status'] }),
    sourceEventId: ctx.state.get({ path: ['sourceEventId'] }),
    sourceQueueItemId: ctx.state.get({ path: ['sourceQueueItemId'] }),
    workEntryId: ctx.state.get({ path: ['workEntryId'] }),
    lastError: ctx.state.get({ path: ['lastError'] }),
  },
  metadata: {
    readOnly: true,
  },
}));
