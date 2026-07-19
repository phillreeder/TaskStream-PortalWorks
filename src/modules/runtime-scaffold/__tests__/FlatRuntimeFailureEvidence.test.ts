import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createFlatRuntimeFailureEvidence } from '../FlatRuntimeFailureEvidence.js';
import { FlatRuntimeFileStore } from '../FlatRuntimeStore.js';


describe('flat RuntimeScaffold failure evidence', () => {
  it('packages logs, partial run files, configuration snapshots and the surfaced failure reason', async () => {
    const root = await mkdtemp(join(tmpdir(), 'taskstream-flat-failure-evidence-'));
    const runtimeRoot = join(root, 'runtime-data');
    const controlPath = join(root, 'command.json');
    const configPath = join(root, 'config.json');
    await writeFile(controlPath, '{"activeExecutionFile":"./config.json"}\n', 'utf8');
    await writeFile(configPath, '{"id":"failure-test"}\n', 'utf8');

    const store = new FlatRuntimeFileStore(runtimeRoot);
    await store.saveRunFile('failed-run', 'run.json', '{"status":"failed"}\n');
    await store.saveRunFile('failed-run', 'trace.ndjson', '{"event":"flow-failed"}\n');
    await store.saveRunFile('failed-run', 'streams/stream-1/state.json', '{"phase":"ready"}\n');

    const archivePath = await createFlatRuntimeFailureEvidence({
      runtimeRoot,
      result: {
        runId: 'failed-run',
        cycleId: 'cycle-1',
        taskRef: 'task-1',
        status: 'failed',
        reason: 'Browser page was unavailable',
        runDirectory: store.runDirectory('failed-run'),
        streamResults: [{
          streamId: 'stream-1',
          unitId: 'unit-1',
          status: 'failed',
          stepCount: 1,
          finalState: { phase: 'ready' },
          reason: 'Browser page was unavailable',
        }],
      },
      configId: 'failure-test',
      controlPath,
      configPath,
      warnings: [],
    });

    const archive = await readFile(archivePath);
    expect(archive.subarray(0, 4).toString('hex')).toBe('504b0304');
    expect(archive.includes(Buffer.from('diagnostics/failure-summary.json'))).toBe(true);
    expect(archive.includes(Buffer.from('diagnostics/control.snapshot.json'))).toBe(true);
    expect(archive.includes(Buffer.from('diagnostics/config.snapshot.json'))).toBe(true);
    expect(archive.includes(Buffer.from('trace.ndjson'))).toBe(true);
    expect(archive.includes(Buffer.from('streams/stream-1/state.json'))).toBe(true);
    expect(archive.includes(Buffer.from('Browser page was unavailable'))).toBe(true);
  });
});
