import type { FlowExecutable } from '@TaskStream/App/domain/tenantProcess/index.js';

export const activateSearchConnectionsFlow = (async (ctx, input) => {
  const unit = await ctx.unit.create({
    type: 'linkedin-connection-search',
    data: {
      sourceTaskId: stringValue(input.sourceTaskId),
      sourceTaskName: stringValue(input.sourceTaskName),
      accountRef: stringValue(input.accountRef),
      startUrl: stringValue(input.startUrl),
    },
  });

  if (unit.status !== 'succeeded') {
    return ctx.fail({ reason: unit.reason ?? 'Unable to create LinkedIn connection-search Unit' });
  }

  return ctx.success({ kind: 'task-activated', unit: unit.value }, {
    metadata: { activationBoundary: 'unit-cycle-stream-materialisation' },
  });
}) satisfies FlowExecutable;

export const openLinkedInLandingFlow = (async (ctx, input) => {
  const startUrl = stringValue(input.startUrl);
  if (!startUrl.startsWith('https://www.linkedin.com/')) {
    return ctx.fail({ reason: 'startUrl must be an https://www.linkedin.com/ URL' });
  }

  const navigation = await ctx.web.navigate({
    url: startUrl,
    timeoutMs: 45_000,
  });
  if (navigation.status !== 'succeeded') {
    ctx.change.set({ path: ['phase'], value: 'blocked' });
    ctx.change.set({ path: ['lastError'], value: navigation.reason });
    return ctx.fail({ reason: navigation.reason });
  }

  const capture = await ctx.web.capture({
    name: 'linkedin-landing-step-001',
    aroundText: stringValue(input.anchorText) || 'Search',
    structureDepth: integerValue(input.structureDepth, 10),
    ancestorDepth: integerValue(input.ancestorDepth, 3),
    descendantDepth: integerValue(input.descendantDepth, 5),
    fullPage: true,
    jpegQuality: 82,
    maxNodes: 3_000,
  });
  if (capture.status !== 'succeeded') {
    ctx.change.set({ path: ['phase'], value: 'blocked' });
    ctx.change.set({ path: ['lastError'], value: capture.reason });
    return ctx.fail({ reason: capture.reason });
  }

  const previousInspections = Number(ctx.state.get({ path: ['pagesInspected'] }) ?? 0);
  ctx.change.set({ path: ['objectiveRef'], value: 'bootstrap-linkedin-connections' });
  ctx.change.set({ path: ['searchTerm'], value: stringValue(input.searchTerm) });
  ctx.change.set({ path: ['phase'], value: 'page_inspected' });
  ctx.change.set({ path: ['currentPageRef'], value: capture.value.archiveRef });
  ctx.change.set({ path: ['pagesInspected'], value: previousInspections + 1 });
  ctx.change.set({ path: ['lastError'], value: '' });

  await ctx.artifact.save({
    name: 'linkedin-landing-step-001.json',
    content: {
      archiveRef: capture.value.archiveRef,
      evidenceDirectoryRef: capture.value.evidenceDirectoryRef,
      finalUrl: capture.value.finalUrl,
      title: capture.value.title,
    },
  });

  return ctx.success({
    phase: 'page_inspected',
    currentPageRef: capture.value.archiveRef,
    pagesInspected: previousInspections + 1,
  }, {
    artifacts: [capture.value.archiveRef],
    metadata: {
      navigation: navigation.value,
      evidence: capture.value,
      nextAction: 'Return the evidence ZIP for selector and login-state analysis.',
    },
  });
}) satisfies FlowExecutable;

export const pauseForEvidenceReviewFlow = (async (ctx) => {
  const currentPageRef = stringValue(ctx.state.get({ path: ['currentPageRef'] }));
  await ctx.logger.info({
    message: 'LinkedIn evidence captured; the mission is paused for user-in-the-middle review.',
    context: { currentPageRef },
  });

  return ctx.success({
    phase: 'page_inspected',
    currentPageRef,
  }, {
    metadata: {
      pausedFor: 'evidence-review',
      currentPageRef,
    },
  });
}) satisfies FlowExecutable;

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function integerValue(value: unknown, fallback: number): number {
  return Number.isInteger(value) ? Number(value) : fallback;
}
