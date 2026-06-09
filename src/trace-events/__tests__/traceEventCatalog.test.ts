import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  RUNTIME_SCAFFOLD_TRACE_EVENTS,
  RUNTIME_SCAFFOLD_TRACE_SELECTORS,
  TRACE_EVENTS,
  collectTraceEventCatalogEntries,
  createTraceEventCatalogSummary,
  proveTraceEventOrderBySeq,
  validateTraceEventCatalogUniqueValues,
} from '../index.js';

const evidenceDir = path.join(process.cwd(), 'test-results/systemtrace');

function writeJsonEvidence(filename: string, value: unknown) {
  mkdirSync(evidenceDir, { recursive: true });
  writeFileSync(path.join(evidenceDir, filename), `${JSON.stringify(value, null, 2)}\n`);
}

function emitAllureEvidenceResult({
  suite,
  name,
  attachmentName,
  attachment,
}: {
  readonly suite: string;
  readonly name: string;
  readonly attachmentName: string;
  readonly attachment: unknown;
}) {
  const resultsDir = path.resolve(process.env.ALLURE_RESULTS_DIR ?? 'allure-results');
  mkdirSync(resultsDir, { recursive: true });

  const now = Date.now();
  const testUuid = randomUUID();
  const containerUuid = randomUUID();
  const attachmentSource = `${randomUUID()}-attachment.json`;
  writeFileSync(path.join(resultsDir, attachmentSource), `${JSON.stringify(attachment, null, 2)}\n`);

  const fullName = `${suite} :: ${name}`;
  const resultPayload = {
    uuid: testUuid,
    historyId: createHash('md5').update(fullName).digest('hex'),
    name,
    fullName,
    status: 'passed',
    stage: 'finished',
    steps: [],
    attachments: [
      {
        name: attachmentName,
        source: attachmentSource,
        type: 'application/json',
      },
    ],
    parameters: [],
    labels: [
      { name: 'language', value: 'TypeScript' },
      { name: 'framework', value: 'vitest' },
      { name: 'suite', value: suite },
      { name: 'package', value: 'src/trace-events' },
    ],
    start: now,
    stop: now,
  };
  const containerPayload = {
    uuid: containerUuid,
    name: suite,
    children: [testUuid],
    befores: [],
    afters: [],
    start: now,
    stop: now,
  };

  writeFileSync(path.join(resultsDir, `${testUuid}-result.json`), `${JSON.stringify(resultPayload, null, 2)}\n`);
  writeFileSync(path.join(resultsDir, `${containerUuid}-container.json`), `${JSON.stringify(containerPayload, null, 2)}\n`);
}

describe('TaskStream / SystemTrace / Trace Event Catalog', () => {
  it('SystemTrace trace event catalog has no duplicate values', () => {
    const summary = createTraceEventCatalogSummary();
    writeJsonEvidence('trace-event-catalog-summary.json', summary);
    emitAllureEvidenceResult({
      suite: 'TaskStream / SystemTrace / Trace Event Catalog',
      name: 'Trace event catalog: uniqueness passed',
      attachmentName: 'trace-event-catalog-summary.json',
      attachment: summary,
    });

    expect(summary.ok).toBe(true);
    expect(summary.duplicateValues).toEqual([]);
    expect(summary.eventCount).toBeGreaterThan(0);
  });

  it('SystemTrace exposes module-separated trace event catalog exports', () => {
    expect(TRACE_EVENTS).toHaveProperty('shared');
    expect(TRACE_EVENTS).toHaveProperty('runtimeScaffold');
    expect(TRACE_EVENTS).toHaveProperty('systemTrace');
    expect(TRACE_EVENTS).toHaveProperty('moduleLink');
    expect(TRACE_EVENTS).toHaveProperty('streamState');
    expect(TRACE_EVENTS).toHaveProperty('tenantProcess');
    expect(TRACE_EVENTS.runtimeScaffold.descriptorLoading.descriptorFileRead).toBe('descriptor-file-read');
    expect(TRACE_EVENTS.runtimeScaffold.descriptorLoading.descriptorNormalize).toBe('descriptor-normalize');
  });

  it('duplicate trace-event values fail catalog validation', () => {
    const duplicateCatalog = {
      firstOwner: {
        path: {
          first: 'duplicate-operation',
        },
      },
      secondOwner: {
        path: {
          second: 'duplicate-operation',
        },
      },
    } as const;

    const validation = validateTraceEventCatalogUniqueValues(duplicateCatalog);

    expect(validation.ok).toBe(false);
    expect(validation.duplicateValues).toHaveLength(1);
    expect(validation.duplicateValues[0]).toMatchObject({
      value: 'duplicate-operation',
    });
  });

  it('catalog entries keep owner and nested path metadata', () => {
    const entries = collectTraceEventCatalogEntries();

    expect(entries).toContainEqual({
      owner: 'runtimeScaffold',
      path: ['descriptorLoading', 'descriptorFileRead'],
      name: 'descriptorLoading.descriptorFileRead',
      value: 'descriptor-file-read',
    });
  });
});

describe('TaskStream / RuntimeScaffold / SystemTrace Order Proof', () => {
  it('runtime-scaffold descriptor trace order is proven by seq', () => {
    const proof = proveTraceEventOrderBySeq(
      [
        {
          operation: RUNTIME_SCAFFOLD_TRACE_EVENTS.descriptorLoading.descriptorFileRead,
          phase: 'START',
          seq: 3,
        },
        {
          operation: RUNTIME_SCAFFOLD_TRACE_EVENTS.descriptorLoading.descriptorFileRead,
          phase: 'END',
          seq: 4,
        },
        {
          operation: RUNTIME_SCAFFOLD_TRACE_EVENTS.descriptorLoading.descriptorNormalize,
          phase: 'START',
          seq: 6,
        },
      ],
      RUNTIME_SCAFFOLD_TRACE_SELECTORS.descriptorFileReadEnd,
      RUNTIME_SCAFFOLD_TRACE_SELECTORS.descriptorNormalizeStart,
    );

    writeJsonEvidence('order-proof-summary.json', proof);
    emitAllureEvidenceResult({
      suite: 'TaskStream / RuntimeScaffold / SystemTrace Order Proof',
      name: 'RuntimeScaffold order proof: descriptor file read before normalize',
      attachmentName: 'order-proof-summary.json',
      attachment: proof,
    });

    expect(proof).toEqual({
      ok: true,
      before: {
        operation: 'descriptor-file-read',
        phase: 'END',
        seq: 4,
      },
      after: {
        operation: 'descriptor-normalize',
        phase: 'START',
        seq: 6,
      },
      deltaSeq: 2,
    });
  });

  it('order proof fails clearly when selectors are not increasing by seq', () => {
    const proof = proveTraceEventOrderBySeq(
      [
        {
          operation: RUNTIME_SCAFFOLD_TRACE_EVENTS.descriptorLoading.descriptorNormalize,
          phase: 'START',
          seq: 3,
        },
        {
          operation: RUNTIME_SCAFFOLD_TRACE_EVENTS.descriptorLoading.descriptorFileRead,
          phase: 'END',
          seq: 4,
        },
      ],
      RUNTIME_SCAFFOLD_TRACE_SELECTORS.descriptorFileReadEnd,
      RUNTIME_SCAFFOLD_TRACE_SELECTORS.descriptorNormalizeStart,
    );

    expect(proof).toMatchObject({
      ok: false,
      reason: 'selector order is not increasing by seq',
    });
  });
});
