import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { Page } from 'playwright';
import {
  BrowserInstanceManager,
  BrowserStreamManager,
  InMemoryWebSessionMaterialStore,
  InMemoryWebSessionStore,
  WebSessionRegistry,
  randomIdFactory,
  type AcquiredBrowserStream,
  type BrowserStreamReleaseDisposition,
} from '@taskstream/web-automation/resources';
import {
  createPlaywrightBrowserResourceDriver,
  createPlaywrightSemanticPageAdapter,
  type PlaywrightSessionMaterial,
} from '@taskstream/web-automation/playwright';
import type {
  FlowWebAccessor,
  FlowWebCaptureInput,
  FlowWebCaptureRecord,
  FlowWebNavigationRecord,
  FlowWebResourceRequirement,
} from '../../domain/tenantProcess/index.js';
import type { FlatRuntimeSession, FlatRuntimeTraceWriter } from './FlatRuntimeAccessors.js';
import { FlatRuntimeFileStore } from './FlatRuntimeStore.js';
import type { RuntimeScaffoldWebOptions } from './types.js';
import { createZipArchive, type ZipEntry } from './zip.js';

export interface FlatRuntimeWebRuntime {
  readonly accessor: FlowWebAccessor;
  readonly archives: readonly string[];
  close(): Promise<void>;
}

export async function createFlatRuntimeWebRuntime(input: {
  readonly options: RuntimeScaffoldWebOptions;
  readonly configDirectory: string;
  readonly store: FlatRuntimeFileStore;
  readonly session: FlatRuntimeSession;
  readonly trace: FlatRuntimeTraceWriter;
}): Promise<FlatRuntimeWebRuntime> {
  const profileDir = resolveFrom(input.configDirectory, input.options.session.profileDir);
  await mkdir(profileDir, { recursive: true });

  const sessionStore = new InMemoryWebSessionStore();
  const materialStore = new InMemoryWebSessionMaterialStore<PlaywrightSessionMaterial>();
  const storageRef = `flat-runtime:${input.options.session.sessionRef}`;
  await materialStore.write(storageRef, { userDataDir: profileDir });

  const sessions = new WebSessionRegistry(sessionStore, materialStore, randomIdFactory);
  await sessions.register({
    sessionRef: input.options.session.sessionRef,
    providerId: input.options.session.providerId,
    tenantRef: input.options.session.tenantRef,
    accountRef: input.options.session.accountRef,
    strategy: input.options.session.strategy,
    storageRef,
  });

  const driver = createPlaywrightBrowserResourceDriver(materialStore, randomIdFactory, {
    maximumBrowserInstances: input.options.browser?.maximumBrowserInstances ?? 1,
    headless: input.options.browser?.headless ?? false,
    launchOptions: input.options.browser?.launchOptions,
    contextOptions: input.options.browser?.contextOptions,
    persistentContextOptions: input.options.browser?.persistentContextOptions,
    resolveInitialSemanticKey: () => 'primary',
  });
  const instances = new BrowserInstanceManager<Page>(driver, randomIdFactory);
  const manager = new BrowserStreamManager<Page>(sessions, instances, randomIdFactory);
  const adapter = createPlaywrightSemanticPageAdapter();
  const archiveRefs: string[] = [];
  let lease: AcquiredBrowserStream<Page> | undefined;
  let releaseDisposition: BrowserStreamReleaseDisposition = 'retain-without-checkpoint';

  async function ensureLease(): Promise<AcquiredBrowserStream<Page>> {
    const requirement = requireWebRequirement(input.session.currentWebRequirement);
    releaseDisposition = requirement.releaseDisposition ?? releaseDisposition;
    if (lease) return lease;

    lease = await manager.acquire({
      requestId: `flat-runtime:${input.session.runId}:${randomUUID()}`,
      sessionRef: input.options.session.sessionRef,
      providerId: input.options.session.providerId,
      tenantRef: input.options.session.tenantRef,
      accountRef: input.options.session.accountRef,
      access: requirement.access ?? 'exclusive',
      executionRef: input.session.runId,
      pagePolicy: requirement.pagePolicy ?? { mode: 'reuse-or-create', semanticKey: 'primary' },
      waitPolicy: requirement.waitPolicy ?? { mode: 'fail-fast' },
      leaseDurationMs: requirement.leaseDurationMs,
    });
    await input.trace('web', 'browser-stream-acquired', {
      browserStreamId: lease.stream.browserStreamId,
      pageRef: lease.activePage?.ref,
      admission: lease.admission,
    });
    return lease;
  }

  async function activePage(): Promise<{ readonly page: Page; readonly pageRef: string }> {
    const currentLease = await ensureLease();
    const runtimePage = manager.getActivePage(currentLease.stream.browserStreamId)
      ?? await manager.selectPage(
        currentLease.stream.browserStreamId,
        input.session.currentWebRequirement?.pagePolicy ?? { mode: 'reuse-or-create', semanticKey: 'primary' },
      );
    return {
      page: runtimePage.handle,
      pageRef: `${runtimePage.ref.browserStreamId}/${runtimePage.ref.webPageId}`,
    };
  }

  const accessor: FlowWebAccessor = {
    async navigate(request) {
      try {
        const selected = await activePage();
        const result = await adapter.navigate(selected.page, {
          url: request.url,
          deadlineAtMs: request.timeoutMs === undefined ? undefined : Date.now() + request.timeoutMs,
        });
        const value: FlowWebNavigationRecord = {
          requestedUrl: request.url,
          finalUrl: result.finalUrl,
          title: result.title ?? '',
          pageRef: selected.pageRef,
        };
        await input.trace('web', 'navigation-completed', value);
        return { status: 'succeeded', value };
      } catch (error) {
        const reason = errorMessage(error);
        await input.trace('web', 'navigation-failed', { reason, url: request.url });
        return { status: 'unavailable', reason };
      }
    },

    async capture(request) {
      try {
        const selected = await activePage();
        const value = await capturePageEvidence({
          request,
          page: selected.page,
          pageRef: selected.pageRef,
          store: input.store,
          runId: input.session.runId,
        });
        archiveRefs.push(value.archiveRef);
        await input.trace('web', 'evidence-captured', value);
        return { status: 'succeeded', value };
      } catch (error) {
        const reason = errorMessage(error);
        await input.trace('web', 'evidence-capture-failed', { reason, name: request.name });
        return { status: 'unavailable', reason };
      }
    },
  };

  return {
    accessor,
    get archives() { return Object.freeze([...archiveRefs]); },
    async close() {
      if (!lease) return;
      const browserStreamId = lease.stream.browserStreamId;
      lease = undefined;
      await manager.release({
        browserStreamId,
        disposition: releaseDisposition,
        reason: 'Flat RuntimeScaffold run completed',
      });
      await input.trace('web', 'browser-stream-released', { browserStreamId, disposition: releaseDisposition });
    },
  };
}

async function capturePageEvidence(input: {
  readonly request: FlowWebCaptureInput;
  readonly page: Page;
  readonly pageRef: string;
  readonly store: FlatRuntimeFileStore;
  readonly runId: string;
}): Promise<FlowWebCaptureRecord> {
  const captureId = `${safeName(input.request.name)}-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const capturedAt = new Date().toISOString();
  const base = `evidence/${captureId}`;
  const screenshotName = 'page.jpg';
  const structureName = 'page-structure.json';
  const visibleTextName = 'visible-text.txt';
  const localName = 'local-structure.json';
  const metadataName = 'page-metadata.json';
  const manifestName = 'manifest.json';

  const screenshot = await input.page.screenshot({
    type: 'jpeg',
    quality: normalizeRange(input.request.jpegQuality, 1, 100, 82),
    fullPage: input.request.fullPage ?? true,
  });
  const structure = await captureStructure(
    input.page,
    normalizeRange(input.request.structureDepth, 1, 30, 10),
    normalizeRange(input.request.maxNodes, 10, 20_000, 3_000),
  );
  const visibleText = await input.page.locator('body').innerText().catch(() => '');
  const localStructure = input.request.aroundText
    ? await captureLocalStructure(
      input.page,
      input.request.aroundText,
      normalizeRange(input.request.ancestorDepth, 0, 20, 3),
      normalizeRange(input.request.descendantDepth, 0, 20, 5),
    )
    : undefined;
  const metadata = {
    captureId,
    capturedAt,
    pageRef: input.pageRef,
    url: input.page.url(),
    title: await input.page.title(),
    viewport: input.page.viewportSize(),
    request: input.request,
  };

  const entries: ZipEntry[] = [
    { name: screenshotName, content: Buffer.from(screenshot) },
    { name: structureName, content: jsonBuffer(structure) },
    { name: visibleTextName, content: Buffer.from(`${visibleText}\n`, 'utf8') },
    { name: metadataName, content: jsonBuffer(metadata) },
  ];
  if (localStructure !== undefined) entries.push({ name: localName, content: jsonBuffer(localStructure) });

  const refs = {
    screenshotRef: input.store.runFilePath(input.runId, `${base}/${screenshotName}`),
    pageStructureRef: input.store.runFilePath(input.runId, `${base}/${structureName}`),
    visibleTextRef: input.store.runFilePath(input.runId, `${base}/${visibleTextName}`),
    pageMetadataRef: input.store.runFilePath(input.runId, `${base}/${metadataName}`),
    manifestRef: input.store.runFilePath(input.runId, `${base}/${manifestName}`),
    ...(localStructure === undefined ? {} : {
      localStructureRef: input.store.runFilePath(input.runId, `${base}/${localName}`),
    }),
  };
  const archiveRef = input.store.runFilePath(input.runId, `exports/${captureId}.zip`);
  const evidenceDirectoryRef = input.store.runFilePath(input.runId, base);
  const manifest = {
    ...metadata,
    evidenceDirectoryRef,
    archiveRef,
    ...refs,
  };
  entries.push({ name: manifestName, content: jsonBuffer(manifest) });

  for (const entry of entries) await input.store.saveRunFile(input.runId, `${base}/${entry.name}`, entry.content);
  await input.store.saveRunFile(input.runId, `exports/${captureId}.zip`, createZipArchive(entries));

  return {
    captureId,
    capturedAt,
    pageRef: input.pageRef,
    finalUrl: metadata.url,
    title: metadata.title,
    evidenceDirectoryRef,
    archiveRef,
    ...refs,
  };
}

async function captureStructure(page: Page, maxDepth: number, maxNodes: number): Promise<unknown> {
  return page.evaluate(({ maxDepth, maxNodes }) => {
    let nodeCount = 0;
    const compact = (value: string | null | undefined, limit = 500) => {
      const normalized = (value ?? '').replace(/\s+/g, ' ').trim();
      return normalized.length > limit ? `${normalized.slice(0, limit)}…` : normalized;
    };
    const visible = (element: Element) => {
      const html = element as HTMLElement;
      const style = getComputedStyle(html);
      const rect = html.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0
        && (rect.width > 0 || rect.height > 0 || html === document.body);
    };
    const serialize = (element: Element, depth: number): unknown => {
      if (nodeCount >= maxNodes || depth > maxDepth || !visible(element)) return null;
      nodeCount += 1;
      const html = element as HTMLElement;
      const ownText = compact(Array.from(element.childNodes)
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent ?? '')
        .join(' '));
      const children = depth === maxDepth
        ? []
        : Array.from(element.children).map((child) => serialize(child, depth + 1)).filter(Boolean);
      return {
        tag: element.tagName.toLowerCase(),
        role: element.getAttribute('role') ?? undefined,
        id: element.id || undefined,
        name: element.getAttribute('name') ?? undefined,
        type: element.getAttribute('type') ?? undefined,
        href: element.getAttribute('href') ?? undefined,
        ariaLabel: element.getAttribute('aria-label') ?? undefined,
        placeholder: element.getAttribute('placeholder') ?? undefined,
        testId: element.getAttribute('data-testid') ?? undefined,
        classes: compact(element.getAttribute('class'), 250) || undefined,
        text: ownText || undefined,
        children,
      };
    };
    const root = document.body ? serialize(document.body, 0) : null;
    return {
      url: location.href,
      title: document.title,
      nodeCount,
      maxDepth,
      maxNodes,
      root,
      truncated: nodeCount >= maxNodes,
    };
  }, { maxDepth, maxNodes });
}

async function captureLocalStructure(
  page: Page,
  aroundText: string,
  ancestorDepth: number,
  descendantDepth: number,
): Promise<unknown> {
  return page.evaluate(({ aroundText, ancestorDepth, descendantDepth }) => {
    const needle = aroundText.replace(/\s+/g, ' ').trim().toLowerCase();
    const compact = (value: string | null | undefined, limit = 700) => {
      const normalized = (value ?? '').replace(/\s+/g, ' ').trim();
      return normalized.length > limit ? `${normalized.slice(0, limit)}…` : normalized;
    };
    const candidates = Array.from(document.querySelectorAll('body *'))
      .map((element) => ({ element, text: compact((element as HTMLElement).innerText, 2_000) }))
      .filter((candidate) => candidate.text.toLowerCase().includes(needle))
      .sort((left, right) => left.text.length - right.text.length);
    const matched = candidates[0]?.element;
    if (!matched) return { found: false, aroundText, ancestorDepth, descendantDepth };

    let root: Element = matched;
    for (let index = 0; index < ancestorDepth && root.parentElement; index += 1) root = root.parentElement;
    const serialize = (element: Element, depth: number): unknown => ({
      tag: element.tagName.toLowerCase(),
      role: element.getAttribute('role') ?? undefined,
      id: element.id || undefined,
      name: element.getAttribute('name') ?? undefined,
      type: element.getAttribute('type') ?? undefined,
      href: element.getAttribute('href') ?? undefined,
      ariaLabel: element.getAttribute('aria-label') ?? undefined,
      placeholder: element.getAttribute('placeholder') ?? undefined,
      testId: element.getAttribute('data-testid') ?? undefined,
      classes: compact(element.getAttribute('class'), 250) || undefined,
      text: compact((element as HTMLElement).innerText) || undefined,
      children: depth >= descendantDepth
        ? []
        : Array.from(element.children).map((child) => serialize(child, depth + 1)),
    });
    const selectorPath = (element: Element) => {
      const parts: string[] = [];
      let cursor: Element | null = element;
      while (cursor && cursor !== document.body) {
        const id = cursor.id ? `#${cursor.id}` : '';
        const role = cursor.getAttribute('role');
        parts.unshift(`${cursor.tagName.toLowerCase()}${id}${role ? `[role="${role}"]` : ''}`);
        cursor = cursor.parentElement;
      }
      return `body > ${parts.join(' > ')}`;
    };
    return {
      found: true,
      aroundText,
      ancestorDepth,
      descendantDepth,
      matchedSelectorPath: selectorPath(matched),
      matchedText: compact((matched as HTMLElement).innerText),
      root: serialize(root, 0),
    };
  }, { aroundText, ancestorDepth, descendantDepth });
}

function requireWebRequirement(value: FlowWebResourceRequirement | undefined): FlowWebResourceRequirement {
  if (!value || value.kind !== 'browser-stream') {
    throw new Error('The selected STO does not declare a browser-stream web requirement');
  }
  return value;
}

function resolveFrom(base: string, value: string): string {
  return path.isAbsolute(value) ? path.normalize(value) : path.resolve(base, value);
}

function normalizeRange(value: number | undefined, minimum: number, maximum: number, fallback: number): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`Value must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

function safeName(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized || 'capture';
}

function jsonBuffer(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
