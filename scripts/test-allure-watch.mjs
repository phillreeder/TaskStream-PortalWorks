#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, watch as watchDir, writeFileSync } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  emitHarnessAllureEvidence,
  loadHarnessManifest,
  parseSelectorOption,
  runHarness,
} from '../tests/harness/harness.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.ALLURE_WATCH_PORT ?? process.env.HARNESS_REPORT_PORT ?? '18080');
const host = process.env.ALLURE_WATCH_HOST ?? '127.0.0.1';
const debounceMs = Number(process.env.ALLURE_WATCH_DEBOUNCE_MS ?? '750');
const resultsDir = resolvePath(process.env.ALLURE_RESULTS_DIR ?? 'allure-results');
const reportDir = resolvePath(process.env.ALLURE_REPORT_DIR ?? 'allure-report');
const coverageDir = resolvePath(process.env.VITEST_COVERAGE_DIR ?? 'coverage');
const rawArgs = process.argv.slice(2);
const helpRequested = rawArgs.includes('--help') || rawArgs.includes('-h');
const skipDbSetup = rawArgs.includes('--no-db') || rawArgs.includes('--skip-db') || rawArgs.includes('--db=false');
const withCoverage = rawArgs.includes('--coverage') || process.env.ALLURE_WATCH_COVERAGE === '1';
const includeHarness = !rawArgs.includes('--no-harness') && process.env.ALLURE_WATCH_HARNESS !== '0';
const scriptFlags = ['--no-db', '--skip-db', '--db=false', '--help', '-h', '--coverage', '--no-harness'];
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

Environment:
  ALLURE_WATCH_PORT=18080
  ALLURE_WATCH_HOST=127.0.0.1
  ALLURE_WATCH_DIRS="src tests packages prisma scripts"
  ALLURE_WATCH_DEBOUNCE_MS=750
  ALLURE_WATCH_COVERAGE=1
  ALLURE_WATCH_HARNESS=0
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
    prepareWritableDir(reportDir, 'allure-report');
    run('npx', ['vitest', 'run', ...(withCoverage ? ['--coverage'] : []), ...vitestArgs], 'vitest');
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
