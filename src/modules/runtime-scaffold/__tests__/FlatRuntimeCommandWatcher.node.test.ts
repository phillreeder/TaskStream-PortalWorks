import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { RuntimeScaffold } from '../RuntimeScaffold.js';
import { flatCommandTenantProcess } from './fixtures/flatCommandTenantProcess.js';

const writeJson = (filePath: string, value: unknown) =>
  writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');

test('flat command watcher executes when the command file changes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'taskstream-flat-watch-'));
  await mkdir(join(root, 'artifacts'), { recursive: true });
  await writeJson(join(root, 'artifacts', 'work-entry.json'), { entry: 'watched' });
  await writeJson(join(root, 'flat.json'), {
    id: 'flat-watch-run',
    mode: 'flatTask',
    tenantProcessRef: { kind: 'fixture', ref: 'flat-command-test' },
    taskRef: 'work',
    runtimeRoot: './runtime',
    input: { sourceId: 'source-1' },
    initialState: {
      status: 'pending',
      workEntryId: { $artifact: { ref: './artifacts/work-entry.json' } },
    },
  });
  const commandPath = join(root, 'command.json');
  await writeJson(commandPath, { activeExecutionFile: './flat.json', revision: 0 });

  const scaffold = new RuntimeScaffold({
    tenantProcessFixtures: { 'flat-command-test': flatCommandTenantProcess },
  });
  let watcher: ReturnType<RuntimeScaffold['watchFlatCommandFile']> | undefined;
  try {
    const completed = new Promise<string>((resolve, reject) => {
      watcher = scaffold.watchFlatCommandFile(commandPath, {
        intervalMs: 25,
        runImmediately: false,
        onResult: (result) => resolve(result.status),
        onError: reject,
      });
    });
    await new Promise((resolve) => setTimeout(resolve, 60));
    await writeJson(commandPath, { activeExecutionFile: './flat.json', revision: 1 });
    const status = await Promise.race([
      completed,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('watcher timeout')), 3_000)),
    ]);
    assert.equal(status, 'succeeded');
  } finally {
    watcher?.close();
  }
});
