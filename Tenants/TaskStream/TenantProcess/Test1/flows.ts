import type { FlowExecutable } from '@TaskStream/App/domain/tenantProcess/index.js';

export const prepareWorkFlow = (async (ctx, input) => {
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

  const credentials = await ctx.credentials.get({
    name: 'examples.prepared-work-api',
  });

  const log = await ctx.logger.info({
    message: 'Preparing work',
    context: {
      sourceEventId: input.sourceEventId,
      sourceQueueItemId: input.sourceQueueItemId,
    },
  });

  const artifact = await ctx.artifact.save({
    name: 'prepared-work.json',
    content: {
      sourceEventId: input.sourceEventId,
      sourceQueueItemId: input.sourceQueueItemId,
    },
  });

  const unit = await ctx.unit.create({
    type: 'prepared-work',
    data: {
      sourceEventId: input.sourceEventId,
      sourceQueueItemId: input.sourceQueueItemId,
    },
  });

  const http = await ctx.http.post({
    url: '/examples/prepared-work',
    body: {
      sourceEventId: input.sourceEventId,
      sourceQueueItemId: input.sourceQueueItemId,
    },
  });

  return ctx.success(undefined, {
    metadata: {
      exampleAccessors: {
        credentials: credentials.status,
        logger: log.status,
        artifact: artifact.status,
        unit: unit.status,
        http: http.status,
      },
    },
  });
}) satisfies FlowExecutable;

export const inspectWorkFlow = (async (ctx) => {
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

  const credentials = await ctx.credentials.get({
    name: 'examples.prepared-work-api',
  });
  const log = await ctx.logger.info({
    message: 'Inspecting prepared work',
  });
  const artifacts = await ctx.artifact.list({ limit: 10 });
  const units = await ctx.unit.list({ type: 'prepared-work', limit: 10 });
  const http = await ctx.http.get({ url: '/examples/prepared-work' });

  return ctx.success(undefined, {
    metadata: {
      exampleAccessors: {
        credentials: credentials.status,
        logger: log.status,
        artifact: artifacts.status,
        unit: units.status,
        http: http.status,
      },
    },
  });
}) satisfies FlowExecutable;
