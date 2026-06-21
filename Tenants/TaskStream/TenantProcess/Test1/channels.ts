import type { ChannelExecutable } from '@TaskStream/App/domain/tenantProcess/index.js';

const processWorkChannelExecutable = ((ctx) => {
  const status = ctx.state.read('status');

  if (status === 'pending') {
    return ctx.selectSto(
      'prepareWork',
      'The Test1 work request is pending and must be prepared by its TenantProcess.',
    );
  }

  return ctx.selectSto(
    'inspectWork',
    'The Test1 work request has left pending state and should be inspected.',
  );
}) satisfies ChannelExecutable;

export const test1ProcessWorkChannel = {
  executable: processWorkChannelExecutable,
};
