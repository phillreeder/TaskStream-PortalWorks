import { describe, expect, it, vi } from 'vitest';
import {
  autoDecisionFlow,
  flagReviewFlow,
  generateReviewArtifactFlow,
  previewScoreFlow,
  startReviewFlow,
  summarizeReviewFlow,
} from './flows.js';

const makeFlowContext = (options = {}) => {
  const state = options.state ?? {};

  return {
    taskRef: 'task.review-submission',
    stoRef: 'sto.review-submission.test',
    state: {
      get: vi.fn(({ path }) => state[path.join('.')]),
    },
    change: {
      set: vi.fn(() => options.setResult),
    },
  };
};

describe('runtime-spine-001 feature flows', () => {
  it('starts review through canonical object-shaped mutations', async () => {
    const ctx = makeFlowContext();
    const input = {
      reviewerId: 'reviewer-001',
    };

    await expect(startReviewFlow(ctx, input)).resolves.toEqual({
      status: 'succeeded',
      result: {
        kind: 'review-started',
        reviewerId: 'reviewer-001',
      },
    });

    expect(ctx.change.set).toHaveBeenNthCalledWith(1, {
      path: ['status'],
      value: 'in_review',
    });
    expect(ctx.change.set).toHaveBeenNthCalledWith(2, {
      path: ['reviewerNotes'],
      value: 'Review started by reviewer-001',
    });
  });

  it('previews score validation with validateOnly instead of applying a mutation', async () => {
    const validation = {
      valid: false,
      error: {
        code: 'CONSTRAINT_VIOLATION',
        path: ['score'],
        operation: 'set_path',
        reason: 'constraint_violation',
        message: 'Score must be at most 100',
      },
    };
    const ctx = makeFlowContext({
      setResult: validation,
    });
    const input = {
      score: 101,
    };

    await expect(previewScoreFlow(ctx, input)).resolves.toEqual({
      status: 'succeeded',
      result: {
        kind: 'score-validation-preview',
        valid: false,
        validation,
      },
    });

    expect(ctx.change.set).toHaveBeenCalledWith(
      {
        path: ['score'],
        value: 101,
      },
      {
        validateOnly: true,
      },
    );
  });

  it('derives a collection mutation from existing state', async () => {
    const ctx = makeFlowContext({
      state: {
        flags: ['missing_document'],
      },
    });
    const input = {
      flag: 'needs_human_review',
    };

    await expect(flagReviewFlow(ctx, input)).resolves.toEqual({
      status: 'succeeded',
      result: {
        kind: 'review-flagged',
        flag: 'needs_human_review',
      },
    });

    expect(ctx.state.get).toHaveBeenCalledWith({ path: ['flags'] });
    expect(ctx.change.set).toHaveBeenCalledWith({
      path: ['flags'],
      value: ['missing_document', 'needs_human_review'],
    });
  });

  it('branches from read state and emits a multi-path auto-decision mutation sequence', async () => {
    const ctx = makeFlowContext({
      state: {
        score: 74,
        flags: [],
      },
    });

    await expect(autoDecisionFlow(ctx, {})).resolves.toEqual({
      status: 'succeeded',
      result: {
        kind: 'review-auto-decision',
        decision: 'approved',
      },
    });

    expect(ctx.change.set).toHaveBeenNthCalledWith(1, {
      path: ['status'],
      value: 'approved',
    });
    expect(ctx.change.set).toHaveBeenNthCalledWith(2, {
      path: ['reviewed'],
      value: true,
    });
    expect(ctx.change.set).toHaveBeenNthCalledWith(3, {
      path: ['reviewerNotes'],
      value: 'Auto-approved with score 74',
    });
  });

  it('returns a read-only summary result without writing state', async () => {
    const ctx = makeFlowContext({
      state: {
        status: 'approved',
        score: 82,
        reviewed: true,
        flags: ['audit_sample'],
      },
    });

    await expect(summarizeReviewFlow(ctx, {})).resolves.toEqual({
      status: 'succeeded',
      result: {
        kind: 'review-summary',
        status: 'approved',
        score: 82,
        reviewed: true,
        flags: ['audit_sample'],
      },
      metadata: {
        readOnly: true,
      },
    });

    expect(ctx.change.set).not.toHaveBeenCalled();
  });

  it('returns a controlled JSON artifact payload', async () => {
    const ctx = makeFlowContext({
      state: {
        status: 'rejected',
        score: 42,
        reviewed: true,
        flags: ['manual_review'],
      },
    });

    await expect(generateReviewArtifactFlow(ctx, {})).resolves.toEqual({
      status: 'succeeded',
      artifacts: [
        {
          artifactId: 'artifact.review-summary-json',
          kind: 'json',
          name: 'review-summary.json',
          content: {
            status: 'rejected',
            score: 42,
            reviewed: true,
            flags: ['manual_review'],
          },
        },
      ],
      result: {
        kind: 'review-artifact-generated',
        artifactId: 'artifact.review-summary-json',
      },
    });
  });
});
