#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const resolvePath = (target) => (path.isAbsolute(target) ? target : path.resolve(projectRoot, target));

const prepareWritableDir = (target, label) => {
  const resolved = resolvePath(target);
  try {
    rmSync(resolved, { recursive: true, force: true });
    mkdirSync(resolved, { recursive: true });
    return resolved;
  } catch (error) {
    if ((error?.code ?? '') === 'EACCES') {
      const fallback = path.join(tmpdir(), `taskstream-${label}-${randomUUID()}`);
      rmSync(fallback, { recursive: true, force: true });
      mkdirSync(fallback, { recursive: true });
      console.warn(`[test-with-allure] ${resolved} not writable, using ${fallback} instead.`);
      return fallback;
    }
    throw error;
  }
};

const preferredResultsDir = process.env.ALLURE_RESULTS_DIR ?? 'allure-results';
const preferredReportDir = process.env.ALLURE_REPORT_DIR ?? 'allure-report';
const preferredCoverageDir = process.env.VITEST_COVERAGE_DIR ?? 'coverage';
const resolvedResultsDir = prepareWritableDir(preferredResultsDir, 'allure-results');
const resolvedReportDir = prepareWritableDir(preferredReportDir, 'allure-report');
const resolvedCoverageDir = prepareWritableDir(preferredCoverageDir, 'coverage');
const env = {
  ...process.env,
  ALLURE_RESULTS_DIR: resolvedResultsDir,
  ALLURE_REPORT_DIR: resolvedReportDir,
  VITEST_COVERAGE_DIR: resolvedCoverageDir,
};

const run = (command, args) => {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    stdio: 'inherit',
    env,
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

run('npx', ['vitest', 'run', '--coverage']);
run('npx', ['allure', 'generate', resolvedResultsDir, '-o', resolvedReportDir]);
