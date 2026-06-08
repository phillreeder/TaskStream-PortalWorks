#!/usr/bin/env node
import {
  defaultPaths,
  harnessReportInfo,
  loadHarnessManifest,
  parseSelectorOption,
  runHarness,
  runHarnessAllure,
  selectionLog,
  verifyHarnessAllureEvidence,
  verifyHarnessEvidence,
} from '../tests/harness/harness.mjs';

const args = process.argv.slice(2);
const mode = args[0] ?? 'run';

const optionValue = (name) => {
  const prefix = `${name}=`;
  const value = args.find((arg) => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : undefined;
};

const manifest = loadHarnessManifest();
const selectors = parseSelectorOption(optionValue('--select'), manifest);

try {
  if (mode === 'list' || mode === 'run') {
    const result = runHarness({ mode, selectors });
    process.stdout.write(selectionLog(result.summary));
    process.exit(result.exitCode);
  }

  if (mode === 'verify') {
    const result = runHarness({ mode: 'run', selectors });
    verifyHarnessEvidence({ evidenceDir: defaultPaths.evidenceDir });
    process.stdout.write(selectionLog(result.summary));
    process.stdout.write('Harness evidence verification passed.\n');
    process.exit(result.exitCode);
  }

  if (mode === 'allure') {
    const result = runHarnessAllure({ mode: 'run', selectors });
    process.stdout.write(selectionLog(result.summary));
    process.stdout.write(`Harness Allure report: ${defaultPaths.allureReportDir}/index.html\n`);
    process.exit(result.exitCode);
  }

  if (mode === 'verify-allure') {
    verifyHarnessAllureEvidence();
    process.stdout.write('Harness Allure evidence verification passed.\n');
    process.exit(0);
  }

  if (mode === 'report-info') {
    const info = harnessReportInfo();
    process.stdout.write(`Harness Allure report: ${info.indexPath}\n`);
    process.stdout.write(`platform-test URL boundary: ${info.url}\n`);
    process.exit(0);
  }

  throw new Error(`Unknown harness mode: ${mode}`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
