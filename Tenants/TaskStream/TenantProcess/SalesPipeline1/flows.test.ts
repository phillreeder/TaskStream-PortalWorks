import { describe, expect, it, vi } from 'vitest';
import { openLinkedInLandingFlow, pauseForEvidenceReviewFlow } from './flows.js';

function succeeded<T>(value: T) {
  return Promise.resolve({ status: 'succeeded' as const, value });
}

describe('SalesPipeline1 LinkedIn browser Flows', () => {
  it('navigates, captures evidence, and advances only the mission StreamState', async () => {
    const set = vi.fn();
    const navigate = vi.fn(() => succeeded({
      requestedUrl: 'https://www.linkedin.com/feed/',
      finalUrl: 'https://www.linkedin.com/feed/',
      title: 'LinkedIn',
      pageRef: 'stream/page',
    }));
    const capture = vi.fn(() => succeeded({
      captureId: 'capture-1',
      capturedAt: '2026-07-19T00:00:00.000Z',
      pageRef: 'stream/page',
      finalUrl: 'https://www.linkedin.com/feed/',
      title: 'LinkedIn',
      evidenceDirectoryRef: '/runtime/evidence/capture-1',
      archiveRef: '/runtime/exports/capture-1.zip',
      screenshotRef: '/runtime/evidence/capture-1/page.jpg',
      pageStructureRef: '/runtime/evidence/capture-1/page-structure.json',
      visibleTextRef: '/runtime/evidence/capture-1/visible-text.txt',
      pageMetadataRef: '/runtime/evidence/capture-1/page-metadata.json',
      manifestRef: '/runtime/evidence/capture-1/manifest.json',
      localStructureRef: '/runtime/evidence/capture-1/local-structure.json',
    }));

    const result = await openLinkedInLandingFlow({
      taskRef: 'searchConnections',
      stoRef: 'openLinkedInLanding',
      state: { get: ({ path }: { path: string[] }) => path[0] === 'pagesInspected' ? 0 : '' },
      change: { set },
      web: { navigate, capture },
      artifact: { save: vi.fn(() => succeeded({ artifactId: 'artifact-1', name: 'step.json' })) },
      success: (value: unknown, options: object) => ({ status: 'succeeded', result: value, ...options }),
      fail: (options: object) => ({ status: 'failed', ...options }),
    } as never, {
      startUrl: 'https://www.linkedin.com/feed/',
      anchorText: 'Search',
      structureDepth: 10,
      ancestorDepth: 3,
      descendantDepth: 5,
    } as never);

    expect(navigate).toHaveBeenCalledWith({ url: 'https://www.linkedin.com/feed/', timeoutMs: 45_000 });
    expect(capture).toHaveBeenCalledWith(expect.objectContaining({
      name: 'linkedin-landing-step-001',
      aroundText: 'Search',
    }));
    expect(set).toHaveBeenCalledWith({ path: ['phase'], value: 'page_inspected' });
    expect(set).toHaveBeenCalledWith({ path: ['currentPageRef'], value: '/runtime/exports/capture-1.zip' });
    expect(set).toHaveBeenCalledWith({ path: ['pagesInspected'], value: 1 });
    expect(result.status).toBe('succeeded');
  });

  it('ends the user-in-the-middle loop without mutating state again', async () => {
    const set = vi.fn();
    const result = await pauseForEvidenceReviewFlow({
      state: { get: () => '/runtime/exports/capture-1.zip' },
      change: { set },
      logger: { info: vi.fn(() => succeeded(undefined)) },
      success: (value: unknown, options: object) => ({ status: 'succeeded', result: value, ...options }),
    } as never);

    expect(set).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({ status: 'succeeded' }));
  });
});
