import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { verifyTicketMetadataCompleteness } from '../metadata/ticketLabels.mjs';

export const HARNESS_STATES = [
  'RUN',
  'SKIP_DISABLED',
  'SKIP_UNSELECTED',
  'NOT_CONFIGURED',
  'BLOCKED_UNKNOWN',
];

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const manifestPath = path.join(projectRoot, 'tests/harness/manifest.json');

export const defaultPaths = {
  evidenceDir: path.join(projectRoot, 'test-results/harness'),
  allureResultsDir: path.join(projectRoot, 'allure-results'),
  allureReportDir: path.join(projectRoot, 'allure-report'),
};

const FIXED_START = 1704067200000;

export function loadHarnessManifest(filePath = manifestPath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

export function parseSelectorOption(rawSelectors, manifest = loadHarnessManifest()) {
  if (!rawSelectors) {
    return [...manifest.defaultSelectors];
  }
  return rawSelectors
    .split(',')
    .map((selector) => selector.trim())
    .filter(Boolean);
}

export function buildHarnessPlan(options = {}) {
  const { mode, selectors, manifest = loadHarnessManifest() } = options;
  const resolvedMode = mode ?? 'run';
  const selectedSelectors = selectors ?? [...manifest.defaultSelectors];
  const knownSelectors = new Set(manifest.paths.map((entry) => entry.selector));
  const unknownSelectors = selectedSelectors.filter((selector) => !knownSelectors.has(selector)).sort();
  const blocked = unknownSelectors.length > 0;
  const selectedSet = new Set(selectedSelectors);

  const outcomes = manifest.paths.map((entry) => {
    const selected = selectedSet.has(entry.selector);
    let state = 'SKIP_UNSELECTED';
    let reason = 'not selected for this harness run';

    if (entry.configured === false) {
      state = 'NOT_CONFIGURED';
      reason = 'known selector has no configured test path yet';
    } else if (selected && entry.enabled === false) {
      state = 'SKIP_DISABLED';
      reason = 'declared selector is disabled';
    } else if (selected) {
      state = blocked ? 'SKIP_UNSELECTED' : 'RUN';
      reason = blocked ? 'blocked before execution by unknown selector' : 'selected and enabled';
    }

    return {
      selector: entry.selector,
      category: entry.category,
      label: entry.label,
      state,
      reason,
      selected,
      enabled: Boolean(entry.enabled),
      configured: entry.configured !== false,
      serviceMode: entry.serviceMode,
      command: entry.command ?? null,
      executed: false,
    };
  });

  for (const selector of unknownSelectors) {
    outcomes.push({
      selector,
      category: 'unknown',
      label: 'Unknown requested harness selector',
      state: 'BLOCKED_UNKNOWN',
      reason: 'requested selector is not declared in the harness manifest',
      selected: true,
      enabled: false,
      configured: false,
      serviceMode: null,
      command: null,
      executed: false,
    });
  }

  return {
    schemaVersion: 1,
    mode: resolvedMode,
    status: blocked ? 'blocked' : 'planned',
    selectedSelectors,
    blocked,
    outcomes: outcomes.sort((left, right) => left.selector.localeCompare(right.selector)),
    executedCommands: [],
  };
}

export function executeHarnessPlan(plan) {
  if (plan.blocked || plan.mode === 'list') {
    return {
      ...plan,
      status: plan.blocked ? 'blocked' : 'listed',
      outcomes: plan.outcomes.map((outcome) => ({ ...outcome, executed: false })),
      executedCommands: [],
    };
  }

  const executedCommands = [];
  const outcomes = plan.outcomes.map((outcome) => {
    if (outcome.state !== 'RUN') {
      return outcome;
    }

    if (outcome.command === 'harness-target:fail-if-executed') {
      throw new Error(`Disabled harness target executed unexpectedly: ${outcome.selector}`);
    }

    if (outcome.command !== 'harness-target:pass') {
      throw new Error(`Unsupported harness command: ${outcome.command}`);
    }

    const command = {
      selector: outcome.selector,
      command: outcome.command,
      serviceMode: outcome.serviceMode,
    };
    executedCommands.push(command);
    return {
      ...outcome,
      executed: true,
    };
  });

  return {
    ...plan,
    status: 'passed',
    outcomes,
    executedCommands,
  };
}

export function selectionLog(summary) {
  const lines = [
    'TaskStream Test Harness Selection',
    `mode: ${summary.mode}`,
    `status: ${summary.status}`,
    'selected selectors:',
    ...summary.selectedSelectors.map((selector) => `  - ${selector}`),
    'outcomes:',
    ...summary.outcomes.map((outcome) => {
      const command = outcome.command ? ` command=${outcome.command}` : '';
      const service = outcome.serviceMode ? ` service=${outcome.serviceMode}` : '';
      return `  - ${outcome.state} selector=${outcome.selector} category=${outcome.category} selected=${outcome.selected} enabled=${outcome.enabled} configured=${outcome.configured} executed=${outcome.executed}${service}${command} reason="${outcome.reason}"`;
    }),
    'executed commands:',
    ...(summary.executedCommands.length > 0
      ? summary.executedCommands.map((entry) => `  - ${entry.command} selector=${entry.selector} service=${entry.serviceMode}`)
      : ['  - none']),
    'service modes:',
    ...summary.outcomes
      .filter((outcome) => outcome.category === 'infrastructure')
      .map((outcome) => `  - ${outcome.selector}: ${outcome.serviceMode ?? 'none'} state=${outcome.state}`),
    '',
  ];

  return `${lines.join('\n')}`;
}

export function writeHarnessEvidence(summary, evidenceDir = defaultPaths.evidenceDir) {
  rmSync(evidenceDir, { recursive: true, force: true });
  mkdirSync(evidenceDir, { recursive: true });
  const logPath = path.join(evidenceDir, 'selection.log');
  const summaryPath = path.join(evidenceDir, 'summary.json');
  const evidence = { logPath, summaryPath };
  writeFileSync(logPath, selectionLog(summary));
  writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  if (summary.systemTrace) {
    const systemTraceSummaryPath = path.join(evidenceDir, 'systemtrace-summary.json');
    writeFileSync(systemTraceSummaryPath, `${JSON.stringify(summary.systemTrace, null, 2)}\n`);
    evidence.systemTraceSummaryPath = systemTraceSummaryPath;
    evidence.systemTraceOutputPath = summary.systemTrace.filePath;

    if ((summary.systemTrace.failedSpans ?? []).length > 0) {
      const failedSpansPath = path.join(evidenceDir, 'failed-spans.json');
      writeFileSync(failedSpansPath, `${JSON.stringify(summary.systemTrace.failedSpans, null, 2)}\n`);
      evidence.failedSpansPath = failedSpansPath;
    }
  }
  return evidence;
}

export function runHarness(options = {}) {
  const plan = buildHarnessPlan(options);
  let summary = executeHarnessPlan(plan);
  if (options.systemTraceOutputPath) {
    summary = {
      ...summary,
      systemTrace: verifySystemTraceOutput({
        filePath: options.systemTraceOutputPath,
        requireFailedSpan: Boolean(options.requireFailedSystemTraceSpan),
      }),
    };
  }
  const evidence = writeHarnessEvidence(summary, options.evidenceDir ?? defaultPaths.evidenceDir);
  return {
    summary,
    evidence,
    exitCode: summary.blocked ? 2 : 0,
  };
}

export function verifyHarnessEvidence({
  evidenceDir = defaultPaths.evidenceDir,
  requireAllStates = false,
  requireCoreStates = true,
} = {}) {
  const logPath = path.join(evidenceDir, 'selection.log');
  const summaryPath = path.join(evidenceDir, 'summary.json');
  if (!existsSync(logPath)) {
    throw new Error(`Missing harness selection log: ${logPath}`);
  }
  if (!existsSync(summaryPath)) {
    throw new Error(`Missing harness summary json: ${summaryPath}`);
  }

  const log = readFileSync(logPath, 'utf8');
  const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
  if (requireCoreStates) {
    for (const state of ['RUN', 'SKIP_DISABLED', 'SKIP_UNSELECTED', 'NOT_CONFIGURED']) {
      if (!log.includes(state)) {
        throw new Error(`Harness selection log does not include ${state}`);
      }
      if (!summary.outcomes.some((outcome) => outcome.state === state)) {
        throw new Error(`Harness summary does not include ${state}`);
      }
    }
  }

  if (requireAllStates && !summary.outcomes.some((outcome) => outcome.state === 'BLOCKED_UNKNOWN')) {
    throw new Error('Harness summary does not include BLOCKED_UNKNOWN');
  }

  if (requireCoreStates) {
    const disabled = summary.outcomes.find((outcome) => outcome.selector === 'module:disabled-would-fail');
    if (!disabled || disabled.state !== 'SKIP_DISABLED' || disabled.executed !== false) {
      throw new Error('Disabled harness target was not recorded as skipped without execution');
    }
  }

  return summary;
}

export function verifySystemTraceOutput({ filePath, requireFailedSpan = false } = {}) {
  if (!filePath) {
    throw new Error('SystemTrace verification requires filePath');
  }
  if (!existsSync(filePath)) {
    throw new Error(`Missing SystemTrace output file: ${filePath}`);
  }

  const lines = readFileSync(filePath, 'utf8')
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    throw new Error(`SystemTrace output file has no records: ${filePath}`);
  }

  const records = lines.map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (cause) {
      throw new Error(`SystemTrace output line ${index + 1} is not valid JSON: ${cause.message}`);
    }
  });

  let previousSeq = 0;
  for (const [index, record] of records.entries()) {
    if (!Number.isInteger(record.seq)) {
      throw new Error(`SystemTrace record ${index + 1} is missing integer seq`);
    }
    if (record.seq <= previousSeq) {
      throw new Error(`SystemTrace seq is not monotonic at record ${index + 1}`);
    }
    previousSeq = record.seq;
  }

  const starts = new Map();
  const ends = [];
  for (const record of records) {
    if (record.family !== 'span' || !record.traceId || !record.spanId) {
      continue;
    }
    const key = `${record.traceId}:${record.spanId}`;
    if (record.phase === 'START') {
      starts.set(key, record);
    } else if (record.phase === 'END') {
      ends.push({ key, record });
      if (!record.timing || typeof record.timing.durationMs !== 'number') {
        throw new Error(`SystemTrace END span is missing durationMs for ${key}`);
      }
      if (typeof record.timing.monotonicStart !== 'number' || typeof record.timing.monotonicEnd !== 'number') {
        throw new Error(`SystemTrace END span is missing monotonic timing for ${key}`);
      }
    }
  }

  if (ends.length === 0) {
    throw new Error('SystemTrace output has no END span records');
  }

  const linkedPairs = ends.filter(({ key }) => starts.has(key));
  if (linkedPairs.length === 0) {
    throw new Error('SystemTrace output has no linked START/END span pairs');
  }

  const failedSpans = ends.filter(({ record }) => record.status === 'error');
  if (requireFailedSpan && failedSpans.length === 0) {
    throw new Error('SystemTrace output has no failed END span records');
  }

  return {
    filePath,
    recordCount: records.length,
    firstSeq: records[0].seq,
    lastSeq: records.at(-1).seq,
    linkedSpanPairs: linkedPairs.length,
    failedSpanEnds: failedSpans.length,
    failedSpans: failedSpans.map(({ record }) => record),
    status: 'verified',
  };
}

function md5(value) {
  return createHash('md5').update(value).digest('hex');
}

function outputOwnerLabels({
  ownerType,
  owner,
  concern,
  requirements = [],
  tickets = [],
  verificationSet,
  runtimeSlice,
}) {
  return [
    ...(verificationSet ? [{ name: 'verificationSet', value: verificationSet }] : []),
    ...tickets.map((ticket) => ({ name: 'ticket', value: ticket })),
    { name: 'ownerType', value: ownerType },
    { name: 'owner', value: owner },
    { name: 'testConcern', value: concern },
    ...requirements.map((requirement) => ({ name: 'requirement', value: requirement })),
    ...(runtimeSlice ? [{ name: 'runtimeSlice', value: runtimeSlice }] : []),
  ];
}

function writeAllureResult({
  resultsDir,
  name,
  fullName,
  status,
  labels = [],
  attachments = [],
  statusDetails,
  suiteName = 'Infrastructure / Test Harness',
  containerName = 'TaskStream / Infrastructure / Test Harness',
}) {
  const testUuid = randomUUID();
  const containerUuid = randomUUID();
  const visibleName = withTicketSuffix(name, labels);
  const visibleFullName = withTicketSuffix(fullName, labels);
  const payload = {
    uuid: testUuid,
    historyId: md5(fullName),
    name: visibleName,
    fullName: visibleFullName,
    status,
    stage: 'finished',
    statusDetails,
    steps: [],
    attachments,
    parameters: metadataParameters(labels),
    labels: [
      { name: 'language', value: 'JavaScript' },
      { name: 'framework', value: 'taskstream-harness' },
      { name: 'parentSuite', value: 'TaskStream' },
      { name: 'suite', value: suiteName },
      ...labels,
      ...metadataTagLabels(labels),
    ].filter((label) => label.value !== undefined && label.value !== null),
    start: FIXED_START,
    stop: FIXED_START,
  };
  const container = {
    uuid: containerUuid,
    name: containerName,
    children: [testUuid],
    befores: [],
    afters: [],
    start: FIXED_START,
    stop: FIXED_START,
  };
  writeFileSync(path.join(resultsDir, `${testUuid}-result.json`), JSON.stringify(payload, null, 2));
  writeFileSync(path.join(resultsDir, `${containerUuid}-container.json`), JSON.stringify(container, null, 2));
}

function labelValues(labels, name) {
  return labels.filter((label) => label.name === name).map((label) => label.value);
}

function withTicketSuffix(value, labels) {
  const tickets = labelValues(labels, 'ticket');
  if (tickets.length === 0) {
    return value;
  }
  return `${value} [tickets: ${tickets.join(',')}]`;
}

function metadataParameters(labels) {
  return labels
    .filter((label) => ['verificationSet', 'ticket', 'requirement', 'ownerType', 'owner', 'testConcern', 'runtimeSlice'].includes(label.name))
    .map((label) => ({ name: label.name, value: label.value }));
}

function metadataTagLabels(labels) {
  return dedupeLabels(labels.flatMap((label) => {
    if (!['verificationSet', 'ticket', 'requirement', 'testConcern', 'runtimeSlice'].includes(label.name)) {
      return [];
    }
    return label.name === 'ticket'
      ? [
          { name: 'tag', value: label.value },
          { name: 'tag', value: `ticket:${label.value}` },
        ]
      : [{ name: 'tag', value: `${label.name}:${label.value}` }];
  }));
}

function dedupeLabels(labels) {
  const seen = new Set();
  return labels.filter((label) => {
    const key = `${label.name}:${label.value}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function emitHarnessAllureEvidence(options = {}) {
  const {
    summary,
    evidence,
    resultsDir = defaultPaths.allureResultsDir,
    clean = true,
  } = options;
  if (!summary) {
    throw new Error('emitHarnessAllureEvidence requires a harness summary');
  }
  if (!evidence?.logPath || !evidence?.summaryPath) {
    throw new Error('emitHarnessAllureEvidence requires harness evidence paths');
  }

  if (clean) {
    rmSync(resultsDir, { recursive: true, force: true });
  }
  mkdirSync(resultsDir, { recursive: true });

  const logAttachment = `${randomUUID()}-attachment.log`;
  const summaryAttachment = `${randomUUID()}-attachment.json`;
  copyFileSync(evidence.logPath, path.join(resultsDir, logAttachment));
  copyFileSync(evidence.summaryPath, path.join(resultsDir, summaryAttachment));

  writeAllureResult({
    resultsDir,
    name: `Harness selection plan: ${summary.status}`,
    fullName: `TaskStream / Infrastructure / Test Harness :: selection plan :: ${summary.status}`,
    status: summary.status === 'blocked' ? 'skipped' : 'passed',
    statusDetails:
      summary.status === 'blocked'
        ? { message: 'Harness selector validation blocked execution before test commands ran' }
        : undefined,
    labels: [
      ...outputOwnerLabels({
        ownerType: 'infrastructure',
        owner: 'Test Harness',
        concern: 'harness-selection-evidence',
        requirements: ['REQ-INFRA-OBS-ALLURE-001', 'REQ-INFRA-OBS-ALLURE-002', 'REQ-INFRA-OBS-ALLURE-004'],
        tickets: ['INFRA-TEST-002', 'ALLURE-OUTPUT-001'],
        verificationSet: 'all-output-visible',
      }),
      { name: 'harnessStatus', value: summary.status },
      { name: 'harnessMode', value: summary.mode },
    ],
    attachments: [
      { name: 'selection.log', source: logAttachment, type: 'text/plain' },
      { name: 'summary.json', source: summaryAttachment, type: 'application/json' },
    ],
  });

  for (const outcome of summary.outcomes) {
    const ownerType = outcome.category === 'application'
      ? 'applicationPath'
      : outcome.category === 'module'
        ? 'module'
        : 'infrastructure';
    const displayOwnerType = outcome.category === 'application'
      ? 'Application Path'
      : outcome.category === 'module'
        ? 'Module'
        : 'Infrastructure';
    writeAllureResult({
      resultsDir,
      name: `${outcome.state} ${outcome.selector}`,
      fullName: `TaskStream / ${displayOwnerType} / ${outcome.selector} :: ${outcome.state}`,
      status: outcome.state === 'RUN' ? 'passed' : 'skipped',
      statusDetails: { message: outcome.reason },
      suiteName: `${displayOwnerType} / Harness Target Selection`,
      containerName: `TaskStream / ${displayOwnerType} / Harness Target Selection`,
      labels: [
        ...outputOwnerLabels({
          ownerType,
          owner: outcome.selector,
          concern: 'harness-target-selection',
          requirements: ['REQ-INFRA-OBS-ALLURE-002', 'REQ-INFRA-OBS-ALLURE-003'],
          tickets: ['INFRA-TEST-001', 'INFRA-TEST-002', 'ALLURE-OUTPUT-001'],
          verificationSet: 'all-output-visible',
        }),
        { name: 'harnessState', value: outcome.state },
        { name: 'harnessSelector', value: outcome.selector },
        { name: 'harnessCategory', value: outcome.category },
        { name: 'harnessServiceMode', value: outcome.serviceMode },
      ],
    });
  }

  if (summary.systemTrace) {
    const attachments = [];
    if (evidence.systemTraceOutputPath && existsSync(evidence.systemTraceOutputPath)) {
      const traceAttachment = `${randomUUID()}-attachment.jsonl`;
      copyFileSync(evidence.systemTraceOutputPath, path.join(resultsDir, traceAttachment));
      attachments.push({ name: 'systemtrace.jsonl', source: traceAttachment, type: 'application/jsonl' });
    }
    if (evidence.systemTraceSummaryPath && existsSync(evidence.systemTraceSummaryPath)) {
      const traceSummaryAttachment = `${randomUUID()}-attachment.json`;
      copyFileSync(evidence.systemTraceSummaryPath, path.join(resultsDir, traceSummaryAttachment));
      attachments.push({ name: 'systemtrace-summary.json', source: traceSummaryAttachment, type: 'application/json' });
    }
    if (evidence.failedSpansPath && existsSync(evidence.failedSpansPath)) {
      const failedSpansAttachment = `${randomUUID()}-attachment.json`;
      copyFileSync(evidence.failedSpansPath, path.join(resultsDir, failedSpansAttachment));
      attachments.push({ name: 'failed-spans.json', source: failedSpansAttachment, type: 'application/json' });
    }

    writeAllureResult({
      resultsDir,
      name: `SystemTrace output: ${summary.systemTrace.status}`,
      fullName: `TaskStream / Module / SystemTrace :: output verification :: ${summary.systemTrace.status}`,
      status: 'passed',
      suiteName: 'Module / SystemTrace',
      containerName: 'TaskStream / Module / SystemTrace',
      labels: [
        ...outputOwnerLabels({
          ownerType: 'module',
          owner: 'SystemTrace',
          concern: 'systemtrace-output-verification',
          requirements: ['REQ-INFRA-OBS-ALLURE-001', 'REQ-INFRA-OBS-ALLURE-004', 'REQ-INFRA-OBS-ALLURE-006'],
          tickets: ['SYST-HARNESS-001', 'ALLURE-OUTPUT-001'],
          verificationSet: 'systemtrace-wireup',
        }),
        { name: 'systemTraceStatus', value: summary.systemTrace.status },
      ],
      attachments,
    });
  }

  writeFileSync(path.join(resultsDir, 'environment.properties'), `NODE_ENV=${process.env.NODE_ENV ?? 'test'}\n`);
  return { resultsDir };
}

export function generateAllureReport({
  resultsDir = defaultPaths.allureResultsDir,
  reportDir = defaultPaths.allureReportDir,
} = {}) {
  rmSync(reportDir, { recursive: true, force: true });
  mkdirSync(reportDir, { recursive: true });
  const result = spawnSync('npx', ['allure', 'generate', resultsDir, '-o', reportDir], {
    cwd: projectRoot,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });

  if (result.status !== 0) {
    throw new Error(`allure generate failed with status ${result.status}\n${result.stdout}\n${result.stderr}`);
  }

  const indexPath = path.join(reportDir, 'index.html');
  if (!existsSync(indexPath)) {
    throw new Error(`Allure report index was not generated: ${indexPath}`);
  }
  return { reportDir, indexPath };
}

export function runHarnessAllure(options = {}) {
  const run = runHarness(options);
  emitHarnessAllureEvidence({
    summary: run.summary,
    evidence: run.evidence,
    resultsDir: options.allureResultsDir ?? defaultPaths.allureResultsDir,
    clean: true,
  });
  if (options.generateReport !== false) {
    generateAllureReport({
      resultsDir: options.allureResultsDir ?? defaultPaths.allureResultsDir,
      reportDir: options.allureReportDir ?? defaultPaths.allureReportDir,
    });
  }
  return run;
}

export function readAllureResults(resultsDir = defaultPaths.allureResultsDir) {
  if (!existsSync(resultsDir)) {
    return [];
  }
  return readdirSync(resultsDir)
    .filter((file) => file.endsWith('-result.json'))
    .sort()
    .map((file) => JSON.parse(readFileSync(path.join(resultsDir, file), 'utf8')));
}

export function verifyHarnessAllureEvidence({
  evidenceDir = defaultPaths.evidenceDir,
  resultsDir = defaultPaths.allureResultsDir,
  reportDir = defaultPaths.allureReportDir,
  requireReport = true,
  requireBlocked = false,
  requireCoreStates = true,
  requireSystemTrace = false,
} = {}) {
  const summary = verifyHarnessEvidence({ evidenceDir, requireAllStates: requireBlocked, requireCoreStates });
  const results = readAllureResults(resultsDir);
  if (results.length === 0) {
    throw new Error(`Missing harness Allure result files in ${resultsDir}`);
  }

  const names = results.map((result) => result.name);
  if (!names.some((name) => name.startsWith('Harness selection plan:'))) {
    throw new Error('Missing harness selection plan Allure result');
  }

  if (requireCoreStates) {
    for (const state of ['RUN', 'SKIP_DISABLED', 'SKIP_UNSELECTED', 'NOT_CONFIGURED']) {
      if (!names.some((name) => name.startsWith(`${state} `))) {
        throw new Error(`Missing ${state} Allure result`);
      }
    }
  }

  if (requireBlocked && !names.some((name) => name.startsWith('BLOCKED_UNKNOWN '))) {
    throw new Error('Missing BLOCKED_UNKNOWN Allure result');
  }

  const plan = results.find((result) => result.name.startsWith('Harness selection plan:'));
  const attachments = plan?.attachments ?? [];
  if (!attachments.some((attachment) => attachment.name === 'selection.log')) {
    throw new Error('Missing selection.log Allure attachment');
  }
  if (!attachments.some((attachment) => attachment.name === 'summary.json')) {
    throw new Error('Missing summary.json Allure attachment');
  }
  assertAttachmentSourcesExist(resultsDir, attachments);

  for (const result of results) {
    for (const labelName of ['verificationSet', 'ticket', 'ownerType', 'owner', 'testConcern']) {
      if (!hasLabel(result, labelName)) {
        throw new Error(`Missing ${labelName} Allure label on result: ${result.name}`);
      }
    }
  }

  if (!results.some((result) => hasLabel(result, 'requirement'))) {
    throw new Error('Missing requirement Allure labels');
  }

  const requiresSystemTrace = requireSystemTrace || Boolean(summary.systemTrace);
  if (requiresSystemTrace) {
    const systemTraceResult = results.find((result) => result.name.startsWith('SystemTrace output:'));
    if (!systemTraceResult) {
      throw new Error('Missing SystemTrace output Allure result');
    }
    if (!hasLabel(systemTraceResult, 'ownerType', 'module') || !hasLabel(systemTraceResult, 'owner', 'SystemTrace')) {
      throw new Error('SystemTrace output Allure result is not grouped by module ownership');
    }
    const systemTraceAttachments = systemTraceResult.attachments ?? [];
    for (const attachmentName of ['systemtrace.jsonl', 'systemtrace-summary.json']) {
      if (!systemTraceAttachments.some((attachment) => attachment.name === attachmentName)) {
        throw new Error(`Missing ${attachmentName} Allure attachment`);
      }
    }
    if ((summary.systemTrace?.failedSpanEnds ?? 0) > 0 && !systemTraceAttachments.some((attachment) => attachment.name === 'failed-spans.json')) {
      throw new Error('Missing failed-spans.json Allure attachment');
    }
    assertAttachmentSourcesExist(resultsDir, systemTraceAttachments);
  }

  if (requireReport && !existsSync(path.join(reportDir, 'index.html'))) {
    throw new Error(`Missing harness Allure report index: ${path.join(reportDir, 'index.html')}`);
  }

  return { results, plan };
}

export function verifyTicketAllureEvidenceMapping({ ticketPaths = [] } = {}) {
  if (!Array.isArray(ticketPaths) || ticketPaths.length === 0) {
    throw new Error('verifyTicketAllureEvidenceMapping requires ticketPaths');
  }

  for (const ticketPath of ticketPaths) {
    const contents = readFileSync(ticketPath, 'utf8');
    if (contents.includes('# Implementation Ticket Template')) {
      continue;
    }
    if (contents.includes('## Output / Allure Visibility')) {
      for (const requiredLine of ['Allure group:', 'Allure result or report section:', 'Raw outputs:', 'Attachments / links:']) {
        if (!contents.includes(requiredLine)) {
          throw new Error(`Ticket is missing ${requiredLine} in Output / Allure Visibility: ${ticketPath}`);
        }
      }
      if (!contents.includes('Not applicable reason:') && !contents.includes('Completion note:')) {
        throw new Error(`Ticket is missing Output / Allure Visibility completion/not-applicable note: ${ticketPath}`);
      }
      if (!/Allure evidence:\s*(?!pending|OPEN)(.+)/u.test(contents)) {
        throw new Error(`Ticket required tests are missing concrete Allure evidence mapping: ${ticketPath}`);
      }
    }
  }

  return {
    checked: ticketPaths.length,
    metadata: verifyTicketMetadataCompleteness({ ticketPaths }),
  };
}

function hasLabel(result, name, value) {
  return (result.labels ?? []).some((label) => label.name === name && (value === undefined || label.value === value));
}

function assertAttachmentSourcesExist(resultsDir, attachments) {
  for (const attachment of attachments) {
    if (!attachment.source || !existsSync(path.join(resultsDir, attachment.source))) {
      throw new Error(`Missing Allure attachment file for ${attachment.name}`);
    }
  }
}

export function harnessReportInfo({
  reportDir = defaultPaths.allureReportDir,
  port = 18080,
} = {}) {
  const indexPath = path.join(reportDir, 'index.html');
  if (!existsSync(indexPath)) {
    throw new Error(`No generated harness Allure report found at ${indexPath}`);
  }
  return {
    reportDir,
    indexPath,
    url: `http://localhost:${port}/allure-report/`,
  };
}
