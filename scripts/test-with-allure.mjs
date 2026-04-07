#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const resultsDir = process.env.ALLURE_RESULTS_DIR ?? 'tmp/allure-results';
const reportDir = process.env.ALLURE_REPORT_DIR ?? 'tmp/allure-report';
const env = {
  ...process.env,
  ALLURE_RESULTS_DIR: resultsDir,
  ALLURE_REPORT_DIR: reportDir,
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
run('npx', ['allure', 'generate', resultsDir, '--clean', '-o', reportDir]);
