import { flow } from '@TaskStream/App/domain/tenantProcess/index.js';

export const startReviewFlow = flow((ctx, input) => {
  ctx.change.set({
    path: ['status'],
    value: 'in_review',
  });

  ctx.change.set({
    path: ['reviewerNotes'],
    value: `Review started by ${input.reviewerId}`,
  });

  return {
    status: 'succeeded',
    result: {
      kind: 'review-started',
      reviewerId: input.reviewerId,
    },
  };
});

export const previewScoreFlow = flow((ctx, input) => {
  const validation = ctx.change.set(
    {
      path: ['score'],
      value: input.score,
    },
    {
      validateOnly: true,
    },
  );

  return {
    status: 'succeeded',
    result: {
      kind: 'score-validation-preview',
      valid: validation.valid,
      validation,
    },
  };
});

export const flagReviewFlow = flow((ctx, input) => {
  const flags = ctx.state.get({
    path: ['flags'],
  });

  ctx.change.set({
    path: ['flags'],
    value: flags.includes(input.flag) ? flags : [...flags, input.flag],
  });

  return {
    status: 'succeeded',
    result: {
      kind: 'review-flagged',
      flag: input.flag,
    },
  };
});

export const autoDecisionFlow = flow((ctx, input) => {
  const score = ctx.state.get({
    path: ['score'],
  });

  const flags = ctx.state.get({
    path: ['flags'],
  });

  const approved = score >= 70 && flags.length === 0;

  ctx.change.set({
    path: ['status'],
    value: approved ? 'approved' : 'rejected',
  });

  ctx.change.set({
    path: ['reviewed'],
    value: true,
  });

  ctx.change.set({
    path: ['reviewerNotes'],
    value: approved
      ? `Auto-approved with score ${score}`
      : `Auto-rejected with score ${score} and ${flags.length} flag(s)`,
  });

  return {
    status: 'succeeded',
    result: {
      kind: 'review-auto-decision',
      decision: approved ? 'approved' : 'rejected',
    },
  };
});

export const summarizeReviewFlow = flow((ctx, input) => {
  return {
    status: 'succeeded',
    result: {
      kind: 'review-summary',
      status: ctx.state.get({ path: ['status'] }),
      score: ctx.state.get({ path: ['score'] }),
      reviewed: ctx.state.get({ path: ['reviewed'] }),
      flags: ctx.state.get({ path: ['flags'] }),
    },
    metadata: {
      readOnly: true,
    },
  };
});

export const generateReviewArtifactFlow = flow((ctx, input) => {
  return {
    status: 'succeeded',
    artifacts: [
      {
        artifactId: 'artifact.review-summary-json',
        kind: 'json',
        name: 'review-summary.json',
        content: {
          status: ctx.state.get({ path: ['status'] }),
          score: ctx.state.get({ path: ['score'] }),
          reviewed: ctx.state.get({ path: ['reviewed'] }),
          flags: ctx.state.get({ path: ['flags'] }),
        },
      },
    ],
    result: {
      kind: 'review-artifact-generated',
      artifactId: 'artifact.review-summary-json',
    },
  };
});
