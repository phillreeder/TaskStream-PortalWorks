import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import type { File, Reporter, Task } from 'vitest/reporters';

const STATUS_MAP: Record<string, 'passed' | 'failed' | 'skipped' | 'unknown'> = {
  pass: 'passed',
  fail: 'failed',
  skip: 'skipped',
  todo: 'skipped',
};

const fallbackDir = (label: string) => join(tmpdir(), `taskstream-${label}-${randomUUID()}`);

const ensureResultsDir = (dir: string): string => {
  try {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    return dir;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EACCES') {
      const fallback = fallbackDir('allure-results');
      mkdirSync(fallback, { recursive: true });
      console.warn(`[allureReporter] Unable to write to ${dir}, using ${fallback} instead.`);
      process.env.ALLURE_RESULTS_DIR = fallback;
      return fallback;
    }
    throw error;
  }
};

function suitePath(task: Task): string[] {
  const segments: string[] = [];
  let current = task.suite;
  while (current) {
    if (current.name) {
      segments.unshift(current.name);
    }
    current = current.suite;
  }
  return segments;
}

function fullName(task: Task, filePath: string): string {
  const segments = [...suitePath(task), task.name];
  return `${filePath} :: ${segments.filter(Boolean).join(' › ')}`;
}

function makeHistoryId(value: string) {
  return createHash('md5').update(value).digest('hex');
}

function statusFromTask(task: Task) {
  const state = task.result?.state ?? 'unknown';
  return STATUS_MAP[state] ?? 'unknown';
}

function writeResult(task: Task, file: File, resultsDir: string) {
  if (!task.result) return;

  const filePath = file.filepath ?? file.name ?? file.id;
  const testUuid = randomUUID();
  const containerUuid = randomUUID();
  const displaySuite = suitePath(task).join(' › ') || filePath;
  const displayName = task.name || filePath;
  const start = task.result.startTime ?? Date.now();
  const stop =
    typeof task.result.duration === 'number'
      ? start + task.result.duration
      : start;
  const status = statusFromTask(task);
  const testFullName = fullName(task, filePath);
  const historyId = makeHistoryId(testFullName);

  const resultPayload: Record<string, unknown> = {
    uuid: testUuid,
    historyId,
    name: displayName,
    fullName: testFullName,
    status,
    stage: 'finished',
    steps: [],
    attachments: [],
    parameters: [],
    labels: [
      { name: 'language', value: 'TypeScript' },
      { name: 'framework', value: 'vitest' },
      { name: 'suite', value: displaySuite },
      { name: 'package', value: filePath },
    ],
    start,
    stop,
  };

  if (task.result.error) {
    resultPayload.statusDetails = {
      message: task.result.error?.message,
      trace: task.result.error?.stack,
    };
  }

  const containerPayload = {
    uuid: containerUuid,
    name: displaySuite || displayName,
    children: [testUuid],
    befores: [],
    afters: [],
    start,
    stop,
  };

  writeFileSync(join(resultsDir, `${testUuid}-result.json`), JSON.stringify(resultPayload, null, 2));
  writeFileSync(join(resultsDir, `${containerUuid}-container.json`), JSON.stringify(containerPayload, null, 2));
}

function walkTasks(task: Task, file: File, resultsDir: string) {
  if (task.type === 'test') {
    writeResult(task, file, resultsDir);
  }

  for (const child of task.tasks ?? []) {
    walkTasks(child, file, resultsDir);
  }
}

export interface AllureReporterOptions {
  resultsDir?: string;
}

const DEFAULT_RESULTS_DIR = 'allure-results';
const DEFAULT_COVERAGE_SUMMARY = 'coverage/coverage-summary.json';

const resolveResultsPath = (dir: string) => (isAbsolute(dir) ? dir : join(process.cwd(), dir));

export function allureReporter(options?: AllureReporterOptions): Reporter {
  const resolvedDir = process.env.ALLURE_RESULTS_DIR ?? options?.resultsDir ?? DEFAULT_RESULTS_DIR;
  const resultsDir = resolveResultsPath(resolvedDir);
  let writableDir = resultsDir;
  let coverageEmitted = false;

  const emitCoverageSummary = () => {
    if (coverageEmitted) {
      return;
    }
    const summaryPath =
      process.env.VITEST_COVERAGE_SUMMARY_PATH ?? process.env.VITEST_COVERAGE_SUMMARY ?? DEFAULT_COVERAGE_SUMMARY;
    const resolvedSummary = isAbsolute(summaryPath) ? summaryPath : join(process.cwd(), summaryPath);
    if (!existsSync(resolvedSummary)) {
      return;
    }

    const attachmentUuid = randomUUID();
    const attachmentFile = `${attachmentUuid}-attachment.json`;
    writeFileSync(join(writableDir, attachmentFile), readFileSync(resolvedSummary));

    const now = Date.now();
    const testUuid = randomUUID();
    const containerUuid = randomUUID();
    const historyId = makeHistoryId('coverage-summary');
    const resultPayload: Record<string, unknown> = {
      uuid: testUuid,
      historyId,
      name: 'Coverage Summary',
      fullName: 'coverage/coverage-summary.json',
      status: 'passed',
      stage: 'finished',
      steps: [],
      attachments: [
        {
          name: 'coverage-summary.json',
          source: attachmentFile,
          type: 'application/json',
        },
      ],
      parameters: [],
      labels: [
        { name: 'language', value: 'TypeScript' },
        { name: 'framework', value: 'vitest' },
        { name: 'suite', value: 'Coverage' },
        { name: 'package', value: 'coverage' },
      ],
      start: now,
      stop: now,
    };

    const containerPayload = {
      uuid: containerUuid,
      name: 'Coverage',
      children: [testUuid],
      befores: [],
      afters: [],
      start: now,
      stop: now,
    };

    writeFileSync(join(writableDir, `${testUuid}-result.json`), JSON.stringify(resultPayload, null, 2));
    writeFileSync(join(writableDir, `${containerUuid}-container.json`), JSON.stringify(containerPayload, null, 2));
    coverageEmitted = true;
  };

  return {
    onInit() {
      writableDir = ensureResultsDir(resultsDir);
      writeFileSync(
        join(writableDir, 'environment.properties'),
        `NODE_ENV=${process.env.NODE_ENV ?? 'test'}\n`,
      );
    },
    async onFinished(files = []) {
      for (const file of files) {
        walkTasks(file, file, writableDir);
      }
      emitCoverageSummary();
    },
  };
}

export default allureReporter;
