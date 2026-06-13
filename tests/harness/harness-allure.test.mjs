import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  emitHarnessAllureEvidence,
  generateAllureReport,
  harnessReportInfo,
  projectRoot,
  readAllureResults,
  runHarness,
  runHarnessAllure,
  verifyHarnessAllureEvidence,
  verifyTicketAllureEvidenceMapping,
} from './harness.mjs';

const tempHarnessDir = () => mkdtempSync(path.join(tmpdir(), 'taskstream-harness-allure-'));

const dirs = () => {
  const root = tempHarnessDir();
  return {
    root,
    evidenceDir: path.join(root, 'test-results/harness'),
    allureResultsDir: path.join(root, 'allure-results'),
    allureReportDir: path.join(root, 'allure-report'),
  };
};

const writeSystemTraceFixture = (filePath) => {
  writeFileSync(filePath, [
    JSON.stringify({
      seq: 1,
      family: 'span',
      phase: 'START',
      traceId: 'trace-1',
      spanId: 'span-1',
      operation: 'fixture-operation',
      timestamp: '2026-06-09T00:00:00.000Z',
      tags: ['fixture'],
    }),
    JSON.stringify({
      seq: 2,
      family: 'span',
      phase: 'END',
      status: 'error',
      traceId: 'trace-1',
      spanId: 'span-1',
      operation: 'fixture-operation',
      timestamp: '2026-06-09T00:00:00.001Z',
      tags: ['fixture'],
      timing: {
        monotonicStart: 1,
        monotonicEnd: 3,
        durationMs: 2,
      },
      error: {
        name: 'Error',
        message: 'fixture failure',
      },
    }),
    '',
  ].join('\n'));
};

test('emits allure result for harness selection plan', () => {
  const context = dirs();
  try {
    runHarnessAllure({ mode: 'run', ...context, generateReport: false });
    const results = readAllureResults(context.allureResultsDir);
    assert.ok(results.some((result) => result.name.startsWith('Harness selection plan: passed')));
  } finally {
    rmSync(context.root, { recursive: true, force: true });
  }
});

test('shows executed and non executed harness targets in allure', () => {
  const context = dirs();
  try {
    runHarnessAllure({ mode: 'run', ...context, generateReport: false });
    const names = readAllureResults(context.allureResultsDir).map((result) => result.name);
    assert.ok(names.some((name) => name.startsWith('RUN ')));
    assert.ok(names.some((name) => name.startsWith('SKIP_DISABLED ')));
    assert.ok(names.some((name) => name.startsWith('SKIP_UNSELECTED ')));
    assert.ok(names.some((name) => name.startsWith('NOT_CONFIGURED ')));

    const blockedRun = runHarness({
      mode: 'run',
      selectors: ['unknown:blocked'],
      evidenceDir: context.evidenceDir,
    });
    emitHarnessAllureEvidence({
      summary: blockedRun.summary,
      evidence: blockedRun.evidence,
      resultsDir: context.allureResultsDir,
      clean: true,
    });
    const blockedNames = readAllureResults(context.allureResultsDir).map((result) => result.name);
    assert.ok(blockedNames.some((name) => name.startsWith('BLOCKED_UNKNOWN ')));
  } finally {
    rmSync(context.root, { recursive: true, force: true });
  }
});

test('attaches harness selection log to allure evidence', async () => {
  const context = dirs();
  try {
    runHarnessAllure({ mode: 'run', ...context, generateReport: false });
    const plan = readAllureResults(context.allureResultsDir).find((result) => result.name.startsWith('Harness selection plan: passed'));
    const attachment = plan.attachments.find((entry) => entry.name === 'selection.log');
    assert.ok(attachment);
    const attachedLog = await readFile(path.join(context.allureResultsDir, attachment.source), 'utf8');
    assert.match(attachedLog, /TaskStream Test Harness Selection/);
  } finally {
    rmSync(context.root, { recursive: true, force: true });
  }
});

test('attaches harness summary json to allure evidence', async () => {
  const context = dirs();
  try {
    runHarnessAllure({ mode: 'run', ...context, generateReport: false });
    const plan = readAllureResults(context.allureResultsDir).find((result) => result.name.startsWith('Harness selection plan: passed'));
    const attachment = plan.attachments.find((entry) => entry.name === 'summary.json');
    assert.ok(attachment);
    const attachedSummary = JSON.parse(await readFile(path.join(context.allureResultsDir, attachment.source), 'utf8'));
    assert.equal(attachedSummary.status, 'passed');
  } finally {
    rmSync(context.root, { recursive: true, force: true });
  }
});

test('generates harness allure html report', () => {
  const context = dirs();
  try {
    runHarnessAllure({ mode: 'run', ...context });
    assert.equal(existsSync(path.join(context.allureReportDir, 'index.html')), true);
  } finally {
    rmSync(context.root, { recursive: true, force: true });
  }
});

test('serves latest harness allure report from platform test', () => {
  const context = dirs();
  try {
    runHarnessAllure({ mode: 'run', ...context });
    const info = harnessReportInfo({ reportDir: context.allureReportDir, port: 18080 });
    assert.equal(info.indexPath, path.join(context.allureReportDir, 'index.html'));
    assert.equal(info.url, 'http://localhost:18080/allure-report/');
  } finally {
    rmSync(context.root, { recursive: true, force: true });
  }
});

test('fails harness allure verify when evidence is missing', () => {
  const context = dirs();
  try {
    assert.throws(
      () =>
        verifyHarnessAllureEvidence({
          evidenceDir: context.evidenceDir,
          resultsDir: context.allureResultsDir,
          reportDir: context.allureReportDir,
        }),
      /Missing harness selection log/,
    );
  } finally {
    rmSync(context.root, { recursive: true, force: true });
  }
});

test('preserves blocked selector evidence in allure', async () => {
  const context = dirs();
  try {
    const result = runHarnessAllure({
      mode: 'run',
      selectors: ['unknown:blocked'],
      ...context,
      generateReport: false,
    });
    assert.equal(result.summary.status, 'blocked');
    verifyHarnessAllureEvidence({
      evidenceDir: context.evidenceDir,
      resultsDir: context.allureResultsDir,
      reportDir: context.allureReportDir,
      requireReport: false,
      requireBlocked: true,
      requireCoreStates: false,
    });
    const log = await readFile(path.join(context.evidenceDir, 'selection.log'), 'utf8');
    assert.match(log, /BLOCKED_UNKNOWN selector=unknown:blocked/);
  } finally {
    rmSync(context.root, { recursive: true, force: true });
  }
});

test('runs harness allure base tests without unrelated prisma setup', async () => {
  const context = dirs();
  const originalDatabaseUrl = process.env.TEST_DATABASE_URL;
  try {
    delete process.env.TEST_DATABASE_URL;
    runHarnessAllure({ mode: 'run', ...context, generateReport: false });
    const files = await readdir(context.allureResultsDir);
    assert.ok(files.some((file) => file.endsWith('-result.json')));
  } finally {
    if (originalDatabaseUrl === undefined) {
      delete process.env.TEST_DATABASE_URL;
    } else {
      process.env.TEST_DATABASE_URL = originalDatabaseUrl;
    }
    rmSync(context.root, { recursive: true, force: true });
  }
});

test('allure groups output by owning section', () => {
  const context = dirs();
  try {
    runHarnessAllure({ mode: 'run', ...context, generateReport: false });
    const results = readAllureResults(context.allureResultsDir);
    const labels = results.flatMap((result) => result.labels ?? []);
    assert.ok(labels.some((label) => label.name === 'ownerType' && label.value === 'infrastructure'));
    assert.ok(labels.some((label) => label.name === 'ownerType' && label.value === 'applicationPath'));
    assert.ok(labels.some((label) => label.name === 'ownerType' && label.value === 'module'));
    assert.ok(labels.some((label) => label.name === 'testConcern' && label.value === 'harness-selection-evidence'));
    assert.ok(labels.some((label) => label.name === 'testConcern' && label.value === 'harness-target-selection'));
    assert.ok(labels.some((label) => label.name === 'verificationSet' && label.value === 'all-output-visible'));
    assert.ok(labels.some((label) => label.name === 'ticket' && label.value === 'INFRA-TEST-001'));
    assert.ok(labels.some((label) => label.name === 'ticket' && label.value === 'INFRA-TEST-002'));
    assert.ok(labels.some((label) => label.name === 'ticket' && label.value === 'ALLURE-OUTPUT-001'));
    verifyHarnessAllureEvidence({
      evidenceDir: context.evidenceDir,
      resultsDir: context.allureResultsDir,
      reportDir: context.allureReportDir,
      requireReport: false,
    });
  } finally {
    rmSync(context.root, { recursive: true, force: true });
  }
});

test('allure exposes raw evidence attachments', async () => {
  const context = dirs();
  try {
    const systemTraceOutputPath = path.join(context.root, 'systemtrace.jsonl');
    writeSystemTraceFixture(systemTraceOutputPath);
    runHarnessAllure({
      mode: 'run',
      ...context,
      generateReport: false,
      systemTraceOutputPath,
      requireFailedSystemTraceSpan: true,
    });

    const { results } = verifyHarnessAllureEvidence({
      evidenceDir: context.evidenceDir,
      resultsDir: context.allureResultsDir,
      reportDir: context.allureReportDir,
      requireReport: false,
      requireSystemTrace: true,
    });
    const systemTrace = results.find((result) => result.name.startsWith('SystemTrace output: verified'));
    const attachmentNames = new Set(systemTrace.attachments.map((attachment) => attachment.name));
    assert.deepEqual(
      [...attachmentNames].sort(),
      ['failed-spans.json', 'systemtrace-summary.json', 'systemtrace.jsonl'].sort(),
    );
    const rawTraceAttachment = systemTrace.attachments.find((attachment) => attachment.name === 'systemtrace.jsonl');
    const attachedTrace = await readFile(path.join(context.allureResultsDir, rawTraceAttachment.source), 'utf8');
    assert.match(attachedTrace, /fixture-operation/);
  } finally {
    rmSync(context.root, { recursive: true, force: true });
  }
});

test('fails allure output verification when required systemtrace evidence is missing', () => {
  const context = dirs();
  try {
    runHarnessAllure({ mode: 'run', ...context, generateReport: false });
    assert.throws(
      () =>
        verifyHarnessAllureEvidence({
          evidenceDir: context.evidenceDir,
          resultsDir: context.allureResultsDir,
          reportDir: context.allureReportDir,
          requireReport: false,
          requireSystemTrace: true,
        }),
      /Missing SystemTrace output Allure result/,
    );
  } finally {
    rmSync(context.root, { recursive: true, force: true });
  }
});

test('tickets record allure evidence mapping', () => {
  const ticketRoot = path.resolve(projectRoot, '../docs/System/DocStream/Implementation/Tickets');
  const implementationTickets = readdirSync(ticketRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(ticketRoot, entry.name, '00-ticket.md'))
    .filter((ticketPath) => existsSync(ticketPath));
  const result = verifyTicketAllureEvidenceMapping({
    ticketPaths: [
      path.join(ticketRoot, '00-template.md'),
      ...implementationTickets,
    ],
  });

  assert.equal(result.checked, implementationTickets.length + 1);
  assert.ok(result.metadata.linkedTickets.includes('ALLURE-OUTPUT-001'));
  assert.ok(result.metadata.linkedTickets.includes('SYST-EVENTS-001'));
});
