#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, watch as watchDir, writeFileSync } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import {
  emitHarnessAllureEvidence,
  loadHarnessManifest,
  parseSelectorOption,
  runHarness,
} from '../tests/harness/harness.mjs';
import { metadataLabelsForTest } from '../tests/metadata/ticketLabels.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.ALLURE_WATCH_PORT ?? process.env.HARNESS_REPORT_PORT ?? '18080');
const host = process.env.ALLURE_WATCH_HOST ?? '127.0.0.1';
const debounceMs = Number(process.env.ALLURE_WATCH_DEBOUNCE_MS ?? '750');
const resultsDir = resolvePath(process.env.ALLURE_RESULTS_DIR ?? 'allure-results');
const reportDir = resolvePath(process.env.ALLURE_REPORT_DIR ?? 'allure-report');
const coverageDir = resolvePath(process.env.VITEST_COVERAGE_DIR ?? 'coverage');
const watchEvidenceDir = resolvePath(process.env.ALLURE_WATCH_EVIDENCE_DIR ?? 'test-results/allure-watch');
const rawArgs = process.argv.slice(2);
const helpRequested = rawArgs.includes('--help') || rawArgs.includes('-h');
const skipDbSetup = rawArgs.includes('--no-db') || rawArgs.includes('--skip-db') || rawArgs.includes('--db=false');
const withCoverage = rawArgs.includes('--coverage') || process.env.ALLURE_WATCH_COVERAGE === '1';
const includeHarness = !rawArgs.includes('--no-harness') && process.env.ALLURE_WATCH_HARNESS !== '0';
const includeNodeTests = !rawArgs.includes('--no-node-tests') && process.env.ALLURE_WATCH_NODE_TESTS !== '0';
const scriptFlags = ['--no-db', '--skip-db', '--db=false', '--help', '-h', '--coverage', '--no-harness', '--no-node-tests'];
const vitestArgs = rawArgs.filter((arg) => !scriptFlags.includes(arg));
const watchDirs = words(process.env.ALLURE_WATCH_DIRS ?? 'src tests packages prisma scripts');
const watchFiles = words(process.env.ALLURE_WATCH_FILES ?? 'vitest.config.ts tsconfig.json package.json prisma.config.ts');
const ignoreTokens = words(
  process.env.ALLURE_WATCH_IGNORE ??
    'node_modules .git dist allure-report allure-results coverage test-results Containers/volumes .timestamp-',
);

const env = loadEnvDefaults({
  ...process.env,
  ALLURE_RESULTS_DIR: resultsDir,
  ALLURE_REPORT_DIR: reportDir,
  VITEST_COVERAGE_DIR: coverageDir,
});

if (skipDbSetup) {
  env.SKIP_TEST_DB_SETUP = '1';
  env.TEST_DATABASE_URL ??= 'postgresql://taskstream_test:taskstream_test@localhost:15433/taskstream_test?schema=public';
}

const watchers = new Map();
const pendingPaths = new Set();
const queuedPaths = new Set();
let debounceHandle;
let runnerActive = false;
let rerunRequested = false;
let server;

if (helpRequested) {
  printUsage();
  process.exit(0);
}

function words(value) {
  return value.split(/\s+/u).map((entry) => entry.trim()).filter(Boolean);
}

function resolvePath(target) {
  return path.isAbsolute(target) ? target : path.resolve(projectRoot, target);
}

function loadEnvDefaults(baseEnv) {
  const next = { ...baseEnv };
  for (const filename of ['.env.test', '.env']) {
    const envPath = path.join(projectRoot, filename);
    if (!existsSync(envPath)) {
      continue;
    }
    for (const rawLine of readFileSync(envPath, 'utf8').split(/\r?\n/u)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) {
        continue;
      }
      const [key, ...valueParts] = line.split('=');
      const value = valueParts.join('=').trim();
      if (key && value && next[key] === undefined) {
        next[key] = value;
      }
    }
  }
  return next;
}

function relativePath(target) {
  const rel = path.relative(projectRoot, target);
  return rel || '.';
}

function log(message) {
  console.log(`${new Date().toISOString()} [allure-watch] ${message}`);
}

function warn(message) {
  console.warn(`${new Date().toISOString()} [allure-watch] WARN ${message}`);
}

function printUsage() {
  console.log(`Usage: npm run test:allure:watch [--] [--no-db] [...vitest filters]

Runs Vitest with Allure reporting, regenerates allure-report on file changes,
and serves the report without restarting the server.

Examples:
  npm run test:allure:watch
  npm run test:allure:watch:no-db -- tests/harness
  npm run test:allure:watch -- --no-db src/modules/SystemTrace
  npm run test:allure:watch -- --no-harness src/modules/SystemTrace
  npm run test:allure:watch -- --no-node-tests src/modules/SystemTrace

Environment:
  ALLURE_WATCH_PORT=18080
  ALLURE_WATCH_HOST=127.0.0.1
  ALLURE_WATCH_DIRS="src tests packages prisma scripts"
  ALLURE_WATCH_DEBOUNCE_MS=750
  ALLURE_WATCH_COVERAGE=1
  ALLURE_WATCH_HARNESS=0
  ALLURE_WATCH_NODE_TESTS=0
  ALLURE_WATCH_HARNESS_SELECT="application:planner-smoke,module:runtime-scaffold-loader"
`);
}

function shouldIgnore(target) {
  const normalized = target.replace(/\\/gu, '/');
  return ignoreTokens.some((token) => normalized.includes(token));
}

function prepareWritableDir(target, label) {
  try {
    rmSync(target, { recursive: true, force: true });
    mkdirSync(target, { recursive: true });
    return target;
  } catch (error) {
    if ((error?.code ?? '') === 'EACCES') {
      const fallback = path.join(tmpdir(), `taskstream-${label}-${randomUUID()}`);
      rmSync(fallback, { recursive: true, force: true });
      mkdirSync(fallback, { recursive: true });
      warn(`${target} not writable, using ${fallback} instead.`);
      return fallback;
    }
    throw error;
  }
}

function run(command, args, label) {
  log(`Starting ${label}.`);
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    stdio: 'inherit',
    env,
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit ${result.status ?? 1}`);
  }
  log(`${label} completed.`);
}

function runOptional(command, args, label, options = {}) {
  log(`Starting ${label}.`);
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    stdio: options.capture ? 'pipe' : 'inherit',
    encoding: options.capture ? 'utf8' : undefined,
    env,
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    warn(`${label} failed with exit ${result.status ?? 1}; continuing so Allure can show available evidence.`);
  } else {
    log(`${label} completed.`);
  }
  return result;
}

function injectAutoRefresh() {
  const indexPath = path.join(reportDir, 'index.html');
  if (!existsSync(indexPath)) {
    return;
  }
  const marker = {
    generatedAt: new Date().toISOString(),
    token: randomUUID(),
  };
  writeFileSync(path.join(reportDir, 'taskstream-refresh.json'), `${JSON.stringify(marker)}\n`);

  const script = `
<script id="taskstream-allure-auto-refresh">
(() => {
  const marker = 'taskstream-refresh.json';
  let currentToken = ${JSON.stringify(marker.token)};
  async function poll() {
    try {
      const response = await fetch(marker + '?t=' + Date.now(), { cache: 'no-store' });
      if (response.ok) {
        const next = await response.json();
        if (next.token && next.token !== currentToken) {
          window.location.reload();
          return;
        }
      }
    } catch {}
    setTimeout(poll, 2000);
  }
  setTimeout(poll, 2000);
})();
</script>`;

  const current = readFileSync(indexPath, 'utf8').replace(
    /\n?<script id="taskstream-allure-auto-refresh">[\s\S]*?<\/script>/u,
    '',
  );
  const updated = current.includes('</body>') ? current.replace('</body>', `${script}\n</body>`) : `${current}\n${script}\n`;
  writeFileSync(indexPath, updated);
}

function runAllureCycle(reason, changedPaths) {
  const relPaths = changedPaths.map((entry) => relativePath(entry));
  log(`Running tests and regenerating Allure report (reason=${reason}${relPaths.length ? `, paths=${relPaths.join(', ')}` : ''}).`);
  runnerActive = true;
  try {
    prepareWritableDir(resultsDir, 'allure-results');
    if (withCoverage) {
      prepareWritableDir(coverageDir, 'coverage');
      mkdirSync(path.join(coverageDir, '.tmp'), { recursive: true });
    }
    prepareWritableDir(watchEvidenceDir, 'allure-watch-evidence');
    prepareWritableDir(reportDir, 'allure-report');
    const vitestJsonPath = path.join(watchEvidenceDir, 'vitest-results.json');
    runOptional(
      'npx',
      [
        'vitest',
        'run',
        ...(withCoverage ? ['--coverage'] : []),
        '--reporter=json',
        `--outputFile=${vitestJsonPath}`,
        ...vitestArgs,
      ],
      'vitest',
    );
    emitVitestAllureResults(vitestJsonPath);
    if (includeNodeTests) {
      emitNodeTestAllureResults();
    }
    if (includeHarness) {
      emitHarnessAllureResults();
    }
    run('npx', ['allure', 'generate', resultsDir, '-o', reportDir], 'allure generate');
    injectAutoRefresh();
    log(`Report refreshed: http://${host}:${port}/allure-report/`);
  } catch (error) {
    warn(error instanceof Error ? error.message : String(error));
  } finally {
    runnerActive = false;
  }
}

function emitVitestAllureResults(vitestJsonPath) {
  if (!existsSync(vitestJsonPath)) {
    warn(`Vitest JSON result file was not produced: ${vitestJsonPath}`);
    return;
  }

  const report = JSON.parse(readFileSync(vitestJsonPath, 'utf8'));
  const attachmentSource = `${randomUUID()}-attachment.json`;
  writeFileSync(path.join(resultsDir, attachmentSource), JSON.stringify(report, null, 2));

  let emitted = 0;
  for (const fileResult of report.testResults ?? []) {
    const filePath = fileResult.name ?? 'unknown-vitest-file';
    const suiteName = `Vitest / ${path.dirname(path.relative(projectRoot, filePath))}`;
    for (const assertion of fileResult.assertionResults ?? []) {
      const name = assertion.fullName?.trim() || assertion.title || 'unnamed vitest test';
      const status = mapVitestStatus(assertion.status);
      const failureMessages = assertion.failureMessages ?? [];
      const relativeFile = path.relative(projectRoot, filePath);
      const ticketLabels = metadataLabelsForTest({
        filePath: relativeFile,
        testName: assertion.title || name.split(/\s›\s/u).at(-1) || name,
        suiteName: name.includes(' › ') ? name.split(/\s›\s/u).slice(0, -1).join(' › ') : suiteName,
      });
      writeAllureResult({
        name,
        fullName: `vitest :: ${relativeFile} :: ${name}`,
        status,
        statusDetails: failureMessages.length > 0
          ? { message: failureMessages[0], trace: failureMessages.join('\n\n') }
          : undefined,
        suiteName,
        containerName: `TaskStream / ${suiteName}`,
        labels: [
          ...(ticketLabels.length > 0
            ? ticketLabels
            : [
                { name: 'verificationSet', value: 'all-output-visible' },
                { name: 'ticket', value: 'ALLURE-OUTPUT-001' },
                { name: 'ownerType', value: 'infrastructure' },
                { name: 'owner', value: 'Vitest' },
                { name: 'testConcern', value: 'vitest-test-execution' },
              ]),
          { name: 'package', value: relativeFile },
        ],
        attachments: [
          { name: 'vitest-results.json', source: attachmentSource, type: 'application/json' },
        ],
        duration: assertion.duration ?? 0,
      });
      emitted += 1;
    }
  }
  log(`Vitest Allure evidence emitted (${emitted} tests).`);
}

function mapVitestStatus(status) {
  if (status === 'passed') return 'passed';
  if (status === 'failed') return 'failed';
  if (status === 'pending' || status === 'skipped' || status === 'todo') return 'skipped';
  return 'unknown';
}

function emitNodeTestAllureResults() {
  const files = collectNodeTestFiles(path.join(projectRoot, 'tests'));
  if (files.length === 0) {
    return;
  }

  log(`Running node:test files (${files.length}).`);
  const result = runOptional('node', ['--test', ...files.map((file) => path.relative(projectRoot, file))], 'node:test', {
    capture: true,
  });
  const output = [result.stdout, result.stderr].filter(Boolean).join('\n');
  mkdirSync(resultsDir, { recursive: true });
  const attachmentSource = `${randomUUID()}-attachment.log`;
  writeFileSync(path.join(resultsDir, attachmentSource), output);

  const parsed = parseNodeTestOutput(output);
  const tests = parsed.length > 0
    ? parsed
    : [{
        name: 'node:test execution',
        status: result.status === 0 ? 'passed' : 'failed',
        duration: 0,
        message: result.status === 0 ? undefined : 'node:test failed before individual test output was parsed',
      }];

  for (const test of tests) {
    const ticketLabels = nodeTestMetadataLabels(test.name);
    writeAllureResult({
      name: test.name,
      fullName: `node:test :: ${test.name}`,
      status: test.status,
      statusDetails: test.message ? { message: test.message } : undefined,
      suiteName: 'Infrastructure / Node Test Runner',
      containerName: 'TaskStream / Infrastructure / Node Test Runner',
      labels: [
        ...(ticketLabels.length > 0
          ? ticketLabels
          : [
              { name: 'verificationSet', value: 'all-output-visible' },
              { name: 'ticket', value: 'ALLURE-OUTPUT-001' },
              { name: 'ownerType', value: 'infrastructure' },
              { name: 'owner', value: 'node:test' },
              { name: 'testConcern', value: 'node-test-execution' },
            ]),
      ],
      attachments: [
        { name: 'node-test.log', source: attachmentSource, type: 'text/plain' },
      ],
      duration: test.duration,
    });
  }
  log(`node:test Allure evidence emitted (${tests.length} entries).`);
}

function nodeTestMetadataLabels(testName) {
  return dedupeLabels([
    ...metadataLabelsForTest({ filePath: 'tests/harness/harness.test.mjs', testName }),
    ...metadataLabelsForTest({ filePath: 'tests/harness/harness-allure.test.mjs', testName }),
  ]);
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

function collectNodeTestFiles(root) {
  if (!existsSync(root)) {
    return [];
  }
  const entries = readdirSyncSafe(root);
  return entries.flatMap((entry) => {
    const target = path.join(root, entry.name);
    if (shouldIgnore(target)) {
      return [];
    }
    if (entry.isDirectory()) {
      return collectNodeTestFiles(target);
    }
    return entry.isFile() && target.endsWith('.test.mjs') ? [target] : [];
  }).sort();
}

function readdirSyncSafe(dir) {
  try {
    return statSync(dir).isDirectory() ? readdirSync(dir, { withFileTypes: true }) : [];
  } catch {
    return [];
  }
}

function parseNodeTestOutput(output) {
  return output
    .split(/\r?\n/u)
    .map((line) => line.match(/^\s*([✔✖])\s(.+?)(?:\s\(([\d.]+)ms\))?$/u))
    .filter(Boolean)
    .map((match) => ({
      name: match[2],
      status: match[1] === '✔' ? 'passed' : 'failed',
      duration: Number(match[3] ?? '0'),
      message: match[1] === '✔' ? undefined : match[2],
    }));
}

function writeAllureResult({
  name,
  fullName,
  status,
  statusDetails,
  suiteName,
  containerName,
  labels,
  attachments,
  duration = 0,
}) {
  const testUuid = randomUUID();
  const containerUuid = randomUUID();
  const start = Date.now();
  const stop = start + Math.max(0, Math.round(duration));
  const visibleName = withTicketSuffix(name, labels);
  const visibleFullName = withTicketSuffix(fullName, labels);
  const visibleLabels = dedupeLabels([...labels, ...metadataTagLabels(labels)]);
  const resultPayload = {
    uuid: testUuid,
    historyId: createHash('md5').update(fullName).digest('hex'),
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
      { name: 'framework', value: 'node:test' },
      { name: 'parentSuite', value: 'TaskStream' },
      { name: 'suite', value: suiteName },
      ...visibleLabels,
    ],
    start,
    stop,
  };
  const containerPayload = {
    uuid: containerUuid,
    name: containerName,
    children: [testUuid],
    befores: [],
    afters: [],
    start,
    stop,
  };
  writeFileSync(path.join(resultsDir, `${testUuid}-result.json`), JSON.stringify(resultPayload, null, 2));
  writeFileSync(path.join(resultsDir, `${containerUuid}-container.json`), JSON.stringify(containerPayload, null, 2));
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
  return labels.flatMap((label) => {
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
}

function emitHarnessAllureResults() {
  log('Emitting harness Allure evidence.');
  const manifest = loadHarnessManifest();
  const selectors = parseSelectorOption(env.ALLURE_WATCH_HARNESS_SELECT, manifest);
  const run = runHarness({
    mode: 'run',
    selectors,
    evidenceDir: path.join(projectRoot, 'test-results/harness'),
  });
  emitHarnessAllureEvidence({
    summary: run.summary,
    evidence: run.evidence,
    resultsDir,
    clean: false,
  });
  log(`Harness Allure evidence emitted (${run.summary.status}).`);
}

function requestRun(reason, changedPaths) {
  if (runnerActive) {
    changedPaths.forEach((entry) => queuedPaths.add(entry));
    rerunRequested = true;
    return;
  }
  runAllureCycle(reason, changedPaths);
  if (rerunRequested) {
    rerunRequested = false;
    const queued = queuedPaths.size ? [...queuedPaths] : [projectRoot];
    queuedPaths.clear();
    requestRun('queued-change', queued);
  }
}

function scheduleRun(reason) {
  if (debounceHandle) {
    clearTimeout(debounceHandle);
  }
  debounceHandle = setTimeout(() => {
    debounceHandle = undefined;
    const changed = pendingPaths.size ? [...pendingPaths] : [projectRoot];
    pendingPaths.clear();
    requestRun(reason, changed);
  }, debounceMs);
}

async function ensureDirectoryWatcher(dirPath) {
  if (shouldIgnore(dirPath) || watchers.has(dirPath)) {
    return;
  }
  let stats;
  try {
    stats = await stat(dirPath);
  } catch {
    return;
  }
  if (!stats.isDirectory()) {
    return;
  }

  const watcher = watchDir(dirPath, { persistent: true }, (eventType, entryName) => {
    const target = entryName ? path.join(dirPath, entryName.toString()) : dirPath;
    if (shouldIgnore(target)) {
      return;
    }
    pendingPaths.add(target);
    scheduleRun(`${eventType}:${relativePath(target)}`);
    if (eventType === 'rename') {
      setTimeout(() => walkDirectory(target).catch(() => undefined), 50);
    }
  });
  watcher.on('error', (error) => {
    warn(`Watcher error in ${relativePath(dirPath)}: ${error.message}`);
    watchers.delete(dirPath);
  });
  watchers.set(dirPath, watcher);
}

async function walkDirectory(dirPath) {
  if (shouldIgnore(dirPath)) {
    return;
  }
  let stats;
  try {
    stats = await stat(dirPath);
  } catch {
    return;
  }
  if (!stats.isDirectory()) {
    return;
  }
  await ensureDirectoryWatcher(dirPath);
  const entries = await readdir(dirPath, { withFileTypes: true });
  await Promise.all(entries.filter((entry) => entry.isDirectory()).map((entry) => walkDirectory(path.join(dirPath, entry.name))));
}

function watchConfiguredFiles() {
  for (const rel of watchFiles) {
    const target = path.resolve(projectRoot, rel);
    if (!existsSync(target) || !statSync(target).isFile()) {
      continue;
    }
    ensureDirectoryWatcher(path.dirname(target)).catch((error) => warn(error.message));
  }
}

function startServer() {
  mkdirSync(reportDir, { recursive: true });
  server = http.createServer((request, response) => {
    const requestUrl = new URL(request.url ?? '/', `http://${host}:${port}`);
    const pathname = decodeURIComponent(requestUrl.pathname);
    const relative = pathname === '/' ? 'allure-report/index.html' : pathname.replace(/^\/+/u, '');
    const target = path.resolve(projectRoot, relative);

    if (!target.startsWith(projectRoot)) {
      response.writeHead(403);
      response.end('Forbidden');
      return;
    }

    const filePath = existsSync(target) && statSync(target).isDirectory()
      ? path.join(target, 'index.html')
      : target;

    if (!existsSync(filePath)) {
      response.writeHead(404, { 'Cache-Control': 'no-store' });
      response.end('Not found');
      return;
    }

    response.writeHead(200, {
      'Content-Type': contentType(filePath),
      'Cache-Control': 'no-store',
    });
    response.end(readFileSync(filePath));
  });
  server.on('error', (error) => {
    warn(`Report server failed: ${error.message}`);
  });
  server.listen(port, host, () => {
    log(`Serving reports at http://${host}:${port}/allure-report/`);
  });
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.html') return 'text/html; charset=utf-8';
  if (ext === '.js') return 'text/javascript; charset=utf-8';
  if (ext === '.css') return 'text/css; charset=utf-8';
  if (ext === '.json') return 'application/json; charset=utf-8';
  if (ext === '.svg') return 'image/svg+xml';
  if (ext === '.png') return 'image/png';
  if (ext === '.ico') return 'image/x-icon';
  return 'application/octet-stream';
}

function shutdown() {
  log('Shutting down.');
  for (const watcher of watchers.values()) {
    watcher.close();
  }
  server?.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

async function bootstrap() {
  startServer();
  if (skipDbSetup) {
    log('DB setup is skipped for this watch run (--no-db). DB-dependent tests may still fail if included.');
  } else {
    log(`Using TEST_DATABASE_URL=${env.TEST_DATABASE_URL ? maskDatabaseUrl(env.TEST_DATABASE_URL) : '(missing)'}`);
  }
  requestRun('initial', [projectRoot]);
  await Promise.all(watchDirs.map((rel) => walkDirectory(path.resolve(projectRoot, rel))));
  watchConfiguredFiles();
  log(`Watching for changes. Open http://${host}:${port}/allure-report/`);
}

function maskDatabaseUrl(value) {
  return value.replace(/:\/\/([^:]+):([^@]+)@/u, '://$1:***@');
}

bootstrap().catch((error) => {
  warn(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
