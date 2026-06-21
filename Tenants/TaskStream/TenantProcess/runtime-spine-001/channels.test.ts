import { describe, expect, it, vi } from 'vitest';
import { reviewSubmissionChannel } from './channels.js';

describe('runtime-spine-001 reviewSubmissionChannel', () => {
  it('selects the start STO for pending reviews', () => {
    const request = reviewSubmissionChannel({
      taskRef: 'task.review-submission',
      state: {
        read: vi.fn(() => 'pending'),
      },
    });

    expect(request.selectedStoRef).toBe('sto.review-submission.start');
    expect(request.flowParams).toEqual({ reviewerId: 'channel-selected-reviewer' });
  });

  it('selects the auto-decision STO for active reviews', () => {
    const request = reviewSubmissionChannel({
      taskRef: 'task.review-submission',
      state: {
        read: vi.fn(() => 'in_review'),
      },
    });

    expect(request.selectedStoRef).toBe('sto.review-submission.auto-decision');
  });

  it('selects the summary STO for terminal reviews', () => {
    const request = reviewSubmissionChannel({
      taskRef: 'task.review-submission',
      state: {
        read: vi.fn(() => 'approved'),
      },
    });

    expect(request.selectedStoRef).toBe('sto.review-submission.summary');
  });
});
