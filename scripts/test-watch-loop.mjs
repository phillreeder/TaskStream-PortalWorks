#!/usr/bin/env node
import { watch as watchDir, watchFile, unwatchFile } from 'node:fs';
import { readdir, stat, access } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';

const root = process.cwd();
const debounceMs = Number.parseInt(process.env.TEST_WATCH_DEBOUNCE_MS ?? '750', 10);
const dirInput = process.env.TEST_WATCH_DIRS ?? 'src tests packages prisma';
const fileInput = process.env.TEST_WATCH_FILES ?? 'vitest.config.ts tsconfig.json package.json prisma.config.ts';
const ignoreInput =
  process.env.TEST_WATCH_IGNORE ??
  'node_modules,.git,dist,allure-report,allure-results,coverage,test-results,TaskStream.zip,Containers/volumes';
const watchDirs = dirInput.split(/\s+/).map((rel) => rel.trim()).filter(Boolean).map((rel) => path.resolve(root, rel));
const watchFiles = fileInput.split(/\s+/).map((rel) => rel.trim()).filter(Boolean).map((rel) => path.resolve(root, rel));
const ignoreTokens = ignoreInput.split(',').map((token) => token.trim()).filter(Boolean);
const watchers = new Map();
const watchedFiles = new Set();
const pendingPaths = new Set();
const queuedPaths = new Set();
let debounceHandle = null;
let runnerActive = false;
let rerunRequested = false;

const log = (message) => {
  console.log(`${new Date().toISOString()} [test-watch-loop] ${message}`);
};
const warn = (message) => {
  console.warn(`${new Date().toISOString()} [test-watch-loop] WARN ${message}`);
};
const relativePath = (target) => {
  const rel = path.relative(root, target);
  return rel || '.';
};
const normalize = (target) => target.replace(/\\/g, '/');
const shouldIgnore = (target) => {
  const normalized = normalize(target);
  return ignoreTokens.some((token) => token && normalized.includes(token));
};

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
    if (!target || shouldIgnore(target)) {
      return;
    }
    pendingPaths.add(target);
    scheduleRun(`${eventType}:${relativePath(target)}`);
    if (eventType === 'rename') {
      setTimeout(() => {
        walkDirectory(target).catch(() => {
          /* swallow */
        });
      }, 50);
    }
  });
  watcher.on('error', (error) => {
    warn(`Watcher error in ${relativePath(dirPath)}: ${error.message}`);
    watchers.delete(dirPath);
    setTimeout(() => {
      ensureDirectoryWatcher(dirPath).catch((err) => warn(`Unable to re-establish watcher for ${relativePath(dirPath)}: ${err.message}`));
    }, 1000);
  });
  watchers.set(dirPath, watcher);
  log(`Watching directory ${relativePath(dirPath)}`);
}

async function walkDirectory(dirPath) {
  if (shouldIgnore(dirPath)) {
    return;
  }
  let dirStats;
  try {
    dirStats = await stat(dirPath);
  } catch {
    return;
  }
  if (!dirStats.isDirectory()) {
    return;
  }
  await ensureDirectoryWatcher(dirPath);
  let dir;
  try {
    dir = await readdir(dirPath, { withFileTypes: true });
  } catch (error) {
    warn(`Failed to read ${relativePath(dirPath)}: ${error.message}`);
    return;
  }
  await Promise.all(
    dir
      .filter((entry) => entry.isDirectory())
      .map((entry) => walkDirectory(path.join(dirPath, entry.name)))
  );
}

async function watchIndividualFiles() {
  for (const filePath of watchFiles) {
    try {
      await access(filePath);
    } catch {
      continue;
    }
    watchFile(filePath, { persistent: true, interval: Number(process.env.TEST_WATCH_FILE_INTERVAL_MS ?? '500') }, () => {
      pendingPaths.add(filePath);
      scheduleRun(`file:${relativePath(filePath)}`);
    });
    watchedFiles.add(filePath);
    log(`Watching file ${relativePath(filePath)}`);
  }
}

function scheduleRun(reason) {
  if (debounceHandle) {
    clearTimeout(debounceHandle);
  }
  debounceHandle = setTimeout(() => {
    debounceHandle = null;
    const changedPaths = pendingPaths.size ? Array.from(pendingPaths) : [];
    pendingPaths.clear();
    requestRun(reason ?? 'change', changedPaths.length ? changedPaths : [root]);
  }, debounceMs);
}

function requestRun(reason, changedPaths) {
  if (runnerActive) {
    changedPaths.forEach((p) => queuedPaths.add(p));
    rerunRequested = true;
    return;
  }
  startRun(reason, changedPaths);
}

function startRun(reason, changedPaths) {
  const relPaths = changedPaths.map((p) => relativePath(p));
  log(`Starting deterministic test cycle (reason=${reason}${relPaths.length ? `, paths=${relPaths.join(', ')}` : ''}).`);
  runnerActive = true;
  const child = spawn('/app/scripts/test-watch-onchange.sh', {
    stdio: 'inherit',
    env: {
      ...process.env,
      WATCH_REASON: reason,
      WATCH_CHANGED_PATHS: relPaths.join(','),
    },
  });
  child.on('exit', (code) => {
    runnerActive = false;
    log(`Deterministic test cycle finished (exit ${code}).`);
    if (rerunRequested) {
      rerunRequested = false;
      const queued = queuedPaths.size ? Array.from(queuedPaths) : [root];
      queuedPaths.clear();
      startRun('queued-change', queued);
    }
  });
}

function shutdown() {
  log('Shutting down watch loop...');
  for (const watcher of watchers.values()) {
    watcher.close();
  }
  for (const filePath of watchedFiles) {
    unwatchFile(filePath);
  }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('uncaughtException', (error) => {
  warn(`Uncaught exception: ${error.message}`);
  shutdown();
});
process.on('unhandledRejection', (error) => {
  warn(`Unhandled rejection: ${error?.message ?? error}`);
  shutdown();
});

async function bootstrap() {
  log(`Initializing watchers with debounce=${debounceMs}ms...`);
  await Promise.all(watchDirs.map((dirPath) => walkDirectory(dirPath)));
  await watchIndividualFiles();
  log('Watch loop ready. Waiting for file changes...');
}

bootstrap().catch((error) => {
  warn(`Failed to bootstrap watch loop: ${error.message}`);
  process.exit(1);
});

setInterval(() => {
  // keep process alive even if no watchers are active
}, 60_000);
