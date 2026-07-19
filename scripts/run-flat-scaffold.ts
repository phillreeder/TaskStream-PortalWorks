import path from 'node:path';
import process from 'node:process';
import {
  RuntimeScaffold,
  type FlatRuntimeControlExecutionResult,
} from '../src/modules/runtime-scaffold/index.js';

/**
 * Flat RuntimeScaffold runner.
 *
 * Examples from the repository root:
 *
 *   npm run scaffold:flat
 *   npm run scaffold:flat -- runtime-scaffold/flat/command.json
 *   npm run scaffold:flat:watch
 *   npm run scaffold:flat:watch -- runtime-scaffold/flat/command.json
 *   npx tsx scripts/run-flat-scaffold.ts once runtime-scaffold/flat/command.json
 *   npx tsx scripts/run-flat-scaffold.ts watch runtime-scaffold/flat/command.json
 *
 * The command file selects a config file. The config supplies the canonical
 * TenantProcess reference, Task reference, input, initial state, and runtime
 * output directory. Artifact references remain ordinary state until a Flow
 * resolves one explicitly through ctx.artifact.resolve().
 */

const DEFAULT_COMMAND_FILE = 'runtime-scaffold/flat/command.json';

type RunMode = 'once' | 'watch';

interface ParsedArguments {
  readonly mode: RunMode;
  readonly commandPath: string;
}

async function main(): Promise<void> {
  const parsed = parseArguments(process.argv.slice(2));
  if (!parsed) return;

  const scaffold = new RuntimeScaffold();

  if (parsed.mode === 'once') {
    const result = await scaffold.executeFlatFromControlFile(parsed.commandPath);
    printResult(result);
    return;
  }

  const watcher = scaffold.watchFlatCommandFile(parsed.commandPath, {
    onResult: printResult,
    onError: printError,
  });

  console.log(JSON.stringify({
    mode: 'watch',
    commandPath: watcher.commandPath,
    message: 'Watching command file. Touch or replace it to run again.',
  }, null, 2));

  const close = () => {
    watcher.close();
    process.exit(0);
  };

  process.once('SIGINT', close);
  process.once('SIGTERM', close);
}

function parseArguments(args: readonly string[]): ParsedArguments | null {
  const first = args[0];

  if (first === '--help' || first === '-h' || first === 'help') {
    printHelp();
    return null;
  }

  const mode: RunMode = first === 'watch' ? 'watch' : 'once';
  const commandArgument = first === 'watch' || first === 'once'
    ? args[1]
    : first;

  const commandPath = path.resolve(
    commandArgument
      ?? process.env.RUNTIME_SCAFFOLD_COMMAND_FILE
      ?? DEFAULT_COMMAND_FILE,
  );

  return { mode, commandPath };
}

function printResult(result: FlatRuntimeControlExecutionResult): void {
  console.log(JSON.stringify({
    mode: 'flatTask',
    commandPath: result.controlPath,
    configPath: result.configPath,
    configId: result.configId,
    runId: result.runId,
    status: result.status,
    ...(result.reason ? { reason: result.reason } : {}),
    runDirectory: result.runDirectory,
    evidenceArchives: result.evidenceArchives,
    warnings: result.warnings,
  }, null, 2));
}

function printError(error: unknown): void {
  if (error instanceof Error) {
    const maybeCode = (error as Error & { readonly code?: unknown }).code;
    console.error(JSON.stringify({
      status: 'failed',
      name: error.name,
      message: error.message,
      ...(typeof maybeCode === 'string' ? { code: maybeCode } : {}),
    }, null, 2));
    return;
  }

  console.error(JSON.stringify({
    status: 'failed',
    message: String(error),
  }, null, 2));
}

function printHelp(): void {
  console.log(`Flat RuntimeScaffold runner

Usage:
  npx tsx scripts/run-flat-scaffold.ts once [command-file]
  npx tsx scripts/run-flat-scaffold.ts watch [command-file]
  npx tsx scripts/run-flat-scaffold.ts [command-file]

Defaults:
  mode: once
  command-file: ${DEFAULT_COMMAND_FILE}

Examples:
  npm run scaffold:flat
  npm run scaffold:flat -- runtime-scaffold/flat/command.json
  npm run scaffold:flat:watch
  npm run scaffold:flat:watch -- runtime-scaffold/flat/command.json

The watcher runs once immediately, then runs again only when the command file
is touched or replaced. Config and artifact files are not watched directly.`);
}

main().catch((error: unknown) => {
  printError(error);
  process.exitCode = 1;
});
