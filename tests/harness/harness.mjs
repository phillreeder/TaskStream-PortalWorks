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
  writeFileSync(logPath, selectionLog(summary));
  writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  return { logPath, summaryPath };
}

export function runHarness(options = {}) {
  const plan = buildHarnessPlan(options);
  const summary = executeHarnessPlan(plan);
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

function md5(value) {
  return createHash('md5').update(value).digest('hex');
}

function writeAllureResult({ resultsDir, name, fullName, status, labels = [], attachments = [], statusDetails }) {
  const testUuid = randomUUID();
  const containerUuid = randomUUID();
  const payload = {
    uuid: testUuid,
    historyId: md5(fullName),
    name,
    fullName,
    status,
    stage: 'finished',
    statusDetails,
    steps: [],
    attachments,
    parameters: [],
    labels: [
      { name: 'language', value: 'JavaScript' },
      { name: 'framework', value: 'taskstream-harness' },
      { name: 'suite', value: 'Harness Selection' },
      ...labels,
    ].filter((label) => label.value !== undefined && label.value !== null),
    start: FIXED_START,
    stop: FIXED_START,
  };
  const container = {
    uuid: containerUuid,
    name: 'Harness Selection',
    children: [testUuid],
    befores: [],
    afters: [],
    start: FIXED_START,
    stop: FIXED_START,
  };
  writeFileSync(path.join(resultsDir, `${testUuid}-result.json`), JSON.stringify(payload, null, 2));
  writeFileSync(path.join(resultsDir, `${containerUuid}-container.json`), JSON.stringify(container, null, 2));
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
    fullName: `TaskStream Harness :: selection plan :: ${summary.status}`,
    status: summary.status === 'blocked' ? 'skipped' : 'passed',
    statusDetails:
      summary.status === 'blocked'
        ? { message: 'Harness selector validation blocked execution before test commands ran' }
        : undefined,
    labels: [
      { name: 'harnessStatus', value: summary.status },
      { name: 'harnessMode', value: summary.mode },
    ],
    attachments: [
      { name: 'selection.log', source: logAttachment, type: 'text/plain' },
      { name: 'summary.json', source: summaryAttachment, type: 'application/json' },
    ],
  });

  for (const outcome of summary.outcomes) {
    writeAllureResult({
      resultsDir,
      name: `${outcome.state} ${outcome.selector}`,
      fullName: `TaskStream Harness :: ${outcome.state} :: ${outcome.selector}`,
      status: outcome.state === 'RUN' ? 'passed' : 'skipped',
      statusDetails: { message: outcome.reason },
      labels: [
        { name: 'harnessState', value: outcome.state },
        { name: 'harnessSelector', value: outcome.selector },
        { name: 'harnessCategory', value: outcome.category },
        { name: 'harnessServiceMode', value: outcome.serviceMode },
      ],
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
} = {}) {
  verifyHarnessEvidence({ evidenceDir, requireAllStates: requireBlocked, requireCoreStates });
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

  if (requireReport && !existsSync(path.join(reportDir, 'index.html'))) {
    throw new Error(`Missing harness Allure report index: ${path.join(reportDir, 'index.html')}`);
  }

  return { results, plan };
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
