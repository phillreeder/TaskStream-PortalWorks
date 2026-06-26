import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RuntimeScaffold } from '../RuntimeScaffold.js';
import { flatCommandTenantProcess } from './fixtures/flatCommandTenantProcess.js';

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function readJson(filePath: string): Promise<any> {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

function flatConfig(runtimeRoot: string, runId: string) {
  return {
    id: runId,
    mode: 'flatTask',
    tenantProcessRef: { kind: 'fixture', ref: 'flat-command-test' },
    taskRef: 'work',
    runtimeRoot,
    input: { sourceId: 'source-1' },
    initialState: {
      status: 'pending',
      workEntryRef: './artifacts/work-entry.json',
      workEntryId: '',
    },
  };
}

describe('RuntimeScaffold flat command pathway', () => {
  it('passes initial state through unchanged and lets the first Flow resolve its artifact reference', async () => {
    const root = await mkdtemp(join(tmpdir(), 'taskstream-flat-command-'));
    await mkdir(join(root, 'artifacts'), { recursive: true });
    await writeJson(join(root, 'artifacts', 'work-entry.json'), { entry: 'from-artifact' });
    await writeJson(join(root, 'flat.json'), flatConfig('./runtime', 'flat-command-run'));
    await writeJson(join(root, 'command.json'), { activeExecutionFile: './flat.json' });

    const result = await new RuntimeScaffold({
      tenantProcessFixtures: { 'flat-command-test': flatCommandTenantProcess },
    }).executeFlatFromControlFile(join(root, 'command.json'));

    expect(result.status).toBe('succeeded');
    expect(result.controlPath).toBe(join(root, 'command.json'));
    expect(result.configPath).toBe(join(root, 'flat.json'));
    expect(result.configId).toBe('flat-command-run');

    const state = await readJson(join(
      result.runDirectory,
      'streams',
      result.streamResults[0]!.streamId,
      'state.json',
    ));
    expect(state).toMatchObject({
      status: 'done',
      workEntryRef: './artifacts/work-entry.json',
    });
    expect(state.workEntryId).toMatch(/^[0-9a-f-]{36}$/);

    const artifact = await readJson(join(result.runDirectory, 'artifacts', `${state.workEntryId}.json`));
    expect(artifact).toMatchObject({
      artifactId: state.workEntryId,
      streamId: result.streamResults[0]!.streamId,
      name: 'work-entry.json',
      content: { entry: 'from-artifact' },
      metadata: {
        sourceRef: './artifacts/work-entry.json',
        format: 'json',
      },
    });
  });
});
