import { channel } from '@TaskStream/App/domain/tenantProcess/index.js';

export const test1ProcessWorkChannel = {
  executable: channel((ctx) => {
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
  }),
};
