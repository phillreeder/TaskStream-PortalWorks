import { flow } from '@TaskStream/App/domain/tenantProcess/index.js';

export const prepareWorkFlow = flow((ctx, input) => {
  
  const hasSourceReferences = ctx.probe('has-source-references', () =>
    typeof input.sourceEventId === 'string'
    && input.sourceEventId.length > 0
    && typeof input.sourceQueueItemId === 'string'
    && input.sourceQueueItemId.length > 0,
  );

  if (!hasSourceReferences) {
    return ctx.fail({
      reason: 'sourceEventId and sourceQueueItemId are required',
    });
  }

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

  return ctx.success();
});

export const inspectWorkFlow = flow((ctx) => {
  const hasPreparedWork = ctx.probe(
    'has-prepared-work',
    () => ctx.state.get({ path: ['status'] }) === 'prepared',
  );

  if (!hasPreparedWork) {
    return ctx.retry({
      reason: 'work is not prepared',
      afterSeconds: 60,
    });
  }

  return ctx.success();
});
