import { describe, expect, it } from 'vitest';
import { searchConnectionsChannel } from './channels.js';

describe('SalesPipeline1 search-connections Channel', () => {
  it('selects the landing action for the initial page-inspection phase', () => {
    const result = searchConnectionsChannel.executable({
      taskRef: 'searchConnections',
      state: { read: () => 'ready_for_page_inspection' },
      selectSto: (stoName: string, reason: string) => ({ type: 'sto', stoName, reason }),
    } as never);

    expect(result.stoName).toBe('openLinkedInLanding');
  });

  it('pauses after evidence has been captured', () => {
    const result = searchConnectionsChannel.executable({
      taskRef: 'searchConnections',
      state: { read: () => 'page_inspected' },
      selectSto: (stoName: string, reason: string) => ({ type: 'sto', stoName, reason }),
    } as never);

    expect(result.stoName).toBe('pauseForEvidenceReview');
  });
});
