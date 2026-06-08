import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  runHarness,
  selectionLog,
  verifyHarnessEvidence,
} from './harness.mjs';

const tempHarnessDir = () => mkdtempSync(path.join(tmpdir(), 'taskstream-harness-'));

test('lists enabled disabled unselected and not configured harness paths', async () => {
  const dir = tempHarnessDir();
  try {
    const result = runHarness({ mode: 'list', evidenceDir: dir });
    assert.equal(result.summary.status, 'listed');
    assert.equal(result.summary.executedCommands.length, 0);
    const states = new Set(result.summary.outcomes.map((outcome) => outcome.state));
    assert.ok(states.has('RUN'));
    assert.ok(states.has('SKIP_DISABLED'));
    assert.ok(states.has('SKIP_UNSELECTED'));
    assert.ok(states.has('NOT_CONFIGURED'));
    const log = await readFile(path.join(dir, 'selection.log'), 'utf8');
    assert.match(log, /RUN selector=application:planner-smoke/);
    assert.match(log, /SKIP_DISABLED selector=module:disabled-would-fail/);
    assert.match(log, /SKIP_UNSELECTED selector=application:unselected-smoke/);
    assert.match(log, /NOT_CONFIGURED selector=infrastructure:redis-disposable/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('runs only selected enabled harness test targets', () => {
  const dir = tempHarnessDir();
  try {
    const result = runHarness({ mode: 'run', evidenceDir: dir });
    assert.equal(result.summary.status, 'passed');
    assert.deepEqual(
      result.summary.executedCommands.map((entry) => entry.selector),
      [
        'application:planner-smoke',
        'infrastructure:harness-stub',
        'module:runtime-scaffold-loader',
      ],
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('records disabled harness targets without executing them', () => {
  const dir = tempHarnessDir();
  try {
    const result = runHarness({ mode: 'run', evidenceDir: dir });
    const disabled = result.summary.outcomes.find((outcome) => outcome.selector === 'module:disabled-would-fail');
    assert.equal(disabled?.state, 'SKIP_DISABLED');
    assert.equal(disabled?.executed, false);
    assert.equal(disabled?.command, 'harness-target:fail-if-executed');
    assert.equal(result.summary.executedCommands.some((entry) => entry.selector === 'module:disabled-would-fail'), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('fails before execution for unknown harness selector', () => {
  const dir = tempHarnessDir();
  try {
    const result = runHarness({
      mode: 'run',
      selectors: ['application:planner-smoke', 'unknown:missing'],
      evidenceDir: dir,
    });
    assert.equal(result.exitCode, 2);
    assert.equal(result.summary.status, 'blocked');
    assert.equal(result.summary.executedCommands.length, 0);
    assert.ok(result.summary.outcomes.some((outcome) => outcome.state === 'BLOCKED_UNKNOWN'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('writes deterministic harness selection log', async () => {
  const dir = tempHarnessDir();
  try {
    const result = runHarness({ mode: 'run', evidenceDir: dir });
    const log = await readFile(path.join(dir, 'selection.log'), 'utf8');
    assert.equal(log, selectionLog(result.summary));
    assert.match(log, /executed commands:\n  - harness-target:pass selector=application:planner-smoke service=deterministic-stub/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('writes deterministic harness summary json', async () => {
  const dir = tempHarnessDir();
  try {
    const result = runHarness({ mode: 'run', evidenceDir: dir });
    const summary = JSON.parse(await readFile(path.join(dir, 'summary.json'), 'utf8'));
    assert.deepEqual(summary, result.summary);
    assert.equal(summary.schemaVersion, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('records service mode for infrastructure path selection', () => {
  const dir = tempHarnessDir();
  try {
    const result = runHarness({
      mode: 'run',
      selectors: ['infrastructure:harness-stub', 'infrastructure:memory-service'],
      evidenceDir: dir,
    });
    const modes = new Map(
      result.summary.outcomes
        .filter((outcome) => outcome.category === 'infrastructure')
        .map((outcome) => [outcome.selector, outcome.serviceMode]),
    );
    assert.equal(modes.get('infrastructure:harness-stub'), 'deterministic-stub');
    assert.equal(modes.get('infrastructure:memory-service'), 'in-memory-service');
    assert.equal(modes.get('infrastructure:redis-disposable'), 'real-disposable-service');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('harness verify mode validates evidence output', () => {
  const dir = tempHarnessDir();
  try {
    runHarness({ mode: 'run', evidenceDir: dir });
    const verified = verifyHarnessEvidence({ evidenceDir: dir });
    assert.equal(verified.status, 'passed');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('harness base tests avoid unrelated prisma global setup', () => {
  const dir = tempHarnessDir();
  const originalDatabaseUrl = process.env.TEST_DATABASE_URL;
  try {
    delete process.env.TEST_DATABASE_URL;
    const result = runHarness({ mode: 'run', evidenceDir: dir });
    assert.equal(result.summary.status, 'passed');
  } finally {
    if (originalDatabaseUrl === undefined) {
      delete process.env.TEST_DATABASE_URL;
    } else {
      process.env.TEST_DATABASE_URL = originalDatabaseUrl;
    }
    rmSync(dir, { recursive: true, force: true });
  }
});
