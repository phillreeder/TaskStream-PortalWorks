#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { harnessReportInfo, projectRoot } from '../tests/harness/harness.mjs';

const port = Number(process.env.HARNESS_REPORT_PORT ?? '18080');
const info = harnessReportInfo({ port });

console.log(`Serving latest harness Allure report from ${info.reportDir}`);
console.log(`platform-test URL boundary: ${info.url}`);

const result = spawnSync('npx', ['http-server', '.', '-p', String(port), '-c-1'], {
  cwd: projectRoot,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
