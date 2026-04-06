import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { File, Reporter, Task } from 'vitest/reporters';

const STATUS_MAP: Record<string, 'passed' | 'failed' | 'skipped' | 'unknown'> = {
  pass: 'passed',
  fail: 'failed',
  skip: 'skipped',
  todo: 'skipped',
};

function ensureResultsDir(resultsDir: string) {
  rmSync(resultsDir, { recursive: true, force: true });
  mkdirSync(resultsDir, { recursive: true });
}

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

export function allureReporter(options?: AllureReporterOptions): Reporter {
  const resultsDir = join(process.cwd(), options?.resultsDir ?? 'test-results');

  return {
    onInit() {
      ensureResultsDir(resultsDir);
      writeFileSync(
        join(resultsDir, 'environment.properties'),
        `NODE_ENV=${process.env.NODE_ENV ?? 'test'}\n`,
      );
    },
    async onFinished(files = []) {
      for (const file of files) {
        walkTasks(file, file, resultsDir);
      }
    },
  };
}

export default allureReporter;
