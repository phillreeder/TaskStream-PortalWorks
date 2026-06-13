import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative } from 'node:path';
import type { Reporter } from 'vitest/reporters';

interface VitestTask {
  readonly type?: string;
  readonly name?: string;
  readonly id?: string;
  readonly suite?: VitestTask;
  readonly tasks?: readonly VitestTask[];
  readonly result?: {
    readonly state?: string;
    readonly startTime?: number;
    readonly duration?: number;
    readonly error?: {
      readonly message?: string;
      readonly stack?: string;
    };
  };
}

interface VitestFile extends VitestTask {
  readonly filepath?: string;
}

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

function suitePath(task: VitestTask): string[] {
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

function fullName(task: VitestTask, filePath: string): string {
  const segments = [...suitePath(task), task.name];
  return `${filePath} :: ${segments.filter(Boolean).join(' › ')}`;
}

function makeHistoryId(value: string) {
  return createHash('md5').update(value).digest('hex');
}

function statusFromTask(task: VitestTask) {
  const state = task.result?.state ?? 'unknown';
  return STATUS_MAP[state] ?? 'unknown';
}

function writeResult(task: VitestTask, file: VitestFile, resultsDir: string) {
  if (!task.result) return;

  const filePath = file.filepath ?? file.name ?? file.id ?? 'unknown-vitest-file';
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

  const metadataLabels = metadataLabelsForTest(filePath, displayName, displaySuite);
  const visibleName = withTicketSuffix(displayName, metadataLabels);
  const visibleFullName = withTicketSuffix(testFullName, metadataLabels);

  const resultPayload: Record<string, unknown> = {
    uuid: testUuid,
    historyId,
    name: visibleName,
    fullName: visibleFullName,
    status,
    stage: 'finished',
    steps: [],
    attachments: [],
    parameters: metadataParameters(metadataLabels),
    labels: [
      { name: 'language', value: 'TypeScript' },
      { name: 'framework', value: 'vitest' },
      { name: 'suite', value: displaySuite },
      { name: 'package', value: filePath },
      ...metadataLabels,
      ...metadataTagLabels(metadataLabels),
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

function walkTasks(task: VitestTask, file: VitestFile, resultsDir: string) {
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
const DEFAULT_TICKET_METADATA = 'tests/metadata/ticket-test-labels.json';

const resolveResultsPath = (dir: string) => (isAbsolute(dir) ? dir : join(process.cwd(), dir));

interface AllureLabel {
  readonly name: string;
  readonly value: string;
}

interface TicketMetadataLabels {
  readonly verificationSet?: string | readonly string[];
  readonly ticket?: string | readonly string[];
  readonly tickets?: readonly string[];
  readonly requirement?: string | readonly string[];
  readonly requirements?: readonly string[];
  readonly ownerType?: string | readonly string[];
  readonly owner?: string | readonly string[];
  readonly testConcern?: string | readonly string[];
  readonly runtimeSlice?: string | readonly string[];
}

interface TicketMetadataEntry {
  readonly file?: string;
  readonly filePrefix?: string;
  readonly testName?: string;
  readonly suiteName?: string;
  readonly labels?: TicketMetadataLabels;
}

interface TicketMetadata {
  readonly entries?: readonly TicketMetadataEntry[];
}

let cachedTicketMetadata: TicketMetadata | undefined;

function loadTicketMetadata(): TicketMetadata {
  if (cachedTicketMetadata) {
    return cachedTicketMetadata;
  }
  const metadataPath = resolveResultsPath(process.env.TICKET_TEST_METADATA_PATH ?? DEFAULT_TICKET_METADATA);
  cachedTicketMetadata = existsSync(metadataPath)
    ? JSON.parse(readFileSync(metadataPath, 'utf8')) as TicketMetadata
    : { entries: [] };
  return cachedTicketMetadata;
}

function metadataLabelsForTest(filePath: string, testName: string, suiteName: string): readonly AllureLabel[] {
  const relativeFile = normalizePath(isAbsolute(filePath) ? relative(process.cwd(), filePath) : filePath);
  const labels = (loadTicketMetadata().entries ?? [])
    .filter((entry) => matchesMetadataEntry(entry, relativeFile, testName, suiteName))
    .flatMap((entry) => expandMetadataLabels(entry.labels ?? {}));
  return dedupeLabels(labels);
}

function matchesMetadataEntry(entry: TicketMetadataEntry, relativeFile: string, testName: string, suiteName: string): boolean {
  if (entry.file && normalizePath(entry.file) !== relativeFile) {
    return false;
  }
  if (entry.filePrefix && !relativeFile.startsWith(normalizePath(entry.filePrefix))) {
    return false;
  }
  if (entry.testName && entry.testName !== testName) {
    return false;
  }
  if (entry.suiteName && entry.suiteName !== suiteName) {
    return false;
  }
  return true;
}

function expandMetadataLabels(labels: TicketMetadataLabels): readonly AllureLabel[] {
  return [
    ...oneOrMany('verificationSet', labels.verificationSet),
    ...oneOrMany('ticket', labels.ticket ?? labels.tickets),
    ...oneOrMany('requirement', labels.requirement ?? labels.requirements),
    ...oneOrMany('ownerType', labels.ownerType),
    ...oneOrMany('owner', labels.owner),
    ...oneOrMany('testConcern', labels.testConcern),
    ...oneOrMany('runtimeSlice', labels.runtimeSlice),
  ];
}

function oneOrMany(name: string, value?: string | readonly string[]): readonly AllureLabel[] {
  if (value === undefined) {
    return [];
  }
  return (Array.isArray(value) ? value : [value]).map((entry) => ({ name, value: entry }));
}

function dedupeLabels(labels: readonly AllureLabel[]): readonly AllureLabel[] {
  const seen = new Set<string>();
  return labels.filter((label) => {
    const key = `${label.name}:${label.value}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function normalizePath(value: string): string {
  return value.replace(/\\/gu, '/');
}

function labelValues(labels: readonly AllureLabel[], name: string): readonly string[] {
  return labels.filter((label) => label.name === name).map((label) => label.value);
}

function withTicketSuffix(value: string, labels: readonly AllureLabel[]): string {
  const tickets = labelValues(labels, 'ticket');
  if (tickets.length === 0) {
    return value;
  }
  return `${value} [tickets: ${tickets.join(',')}]`;
}

function metadataParameters(labels: readonly AllureLabel[]): readonly { readonly name: string; readonly value: string }[] {
  return labels
    .filter((label) => ['verificationSet', 'ticket', 'requirement', 'ownerType', 'owner', 'testConcern', 'runtimeSlice'].includes(label.name))
    .map((label) => ({ name: label.name, value: label.value }));
}

function metadataTagLabels(labels: readonly AllureLabel[]): readonly AllureLabel[] {
  const tags = labels.flatMap((label) => {
    if (!['verificationSet', 'ticket', 'requirement', 'testConcern', 'runtimeSlice'].includes(label.name)) {
      return [];
    }
    return label.name === 'ticket'
      ? [
          { name: 'tag', value: label.value },
          { name: 'tag', value: `ticket:${label.value}` },
        ]
      : [{ name: 'tag', value: `${label.name}:${label.value}` }];
  });
  return dedupeLabels(tags);
}

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
      for (const file of files as readonly VitestFile[]) {
        walkTasks(file, file, writableDir);
      }
      emitCoverageSummary();
    },
  };
}

export default allureReporter;
