import type { ChannelExecutable } from '@TaskStream/App/domain/tenantProcess/index.js';

export const searchConnectionsChannel = {
  executable: ((ctx) => {
    const phase = ctx.state.read('phase');

    if (phase === 'ready_for_page_inspection') {
      return ctx.selectSto(
        'openLinkedInLanding',
        'The first mission step must open LinkedIn and capture the real authenticated landing surface.',
      );
    }

    return ctx.selectSto(
      'pauseForEvidenceReview',
      'The latest browser evidence must be reviewed before another concrete portal action is authorised.',
    );
  }) satisfies ChannelExecutable,
};
