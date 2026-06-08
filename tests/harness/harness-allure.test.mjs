import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  emitHarnessAllureEvidence,
  generateAllureReport,
  harnessReportInfo,
  readAllureResults,
  runHarness,
  runHarnessAllure,
  verifyHarnessAllureEvidence,
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

test('emits allure result for harness selection plan', () => {
  const context = dirs();
  try {
    runHarnessAllure({ mode: 'run', ...context, generateReport: false });
    const results = readAllureResults(context.allureResultsDir);
    assert.ok(results.some((result) => result.name === 'Harness selection plan: passed'));
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
    const plan = readAllureResults(context.allureResultsDir).find((result) => result.name === 'Harness selection plan: passed');
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
    const plan = readAllureResults(context.allureResultsDir).find((result) => result.name === 'Harness selection plan: passed');
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
