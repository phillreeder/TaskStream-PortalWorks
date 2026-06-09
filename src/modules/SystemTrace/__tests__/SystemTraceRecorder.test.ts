import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FileSystemTraceAdapter, SystemTraceRecorder } from '../index.js';
import type { SystemTraceAdapter, SystemTraceRecord } from '../index.js';

class MemoryAdapter implements SystemTraceAdapter {
  readonly records: SystemTraceRecord[] = [];

  async append(record: SystemTraceRecord): Promise<void> {
    this.records.push(record);
  }

  async flush(): Promise<void> {}
}

class FailingAdapter implements SystemTraceAdapter {
  async append(): Promise<void> {
    throw new Error('disk full');
  }

  async flush(): Promise<void> {}
}

describe('SystemTraceRecorder', () => {
  it('assigns monotonic capture sequence numbers', async () => {
    const adapter = new MemoryAdapter();
    const recorder = new SystemTraceRecorder({ adapter });

    await recorder.trace({ operation: 'first', eventType: 'point' });
    await recorder.trace({ operation: 'second', eventType: 'point' });

    expect(adapter.records.map((record) => record.seq)).toEqual([1, 2]);
  });

  it('writes human-readable logs and structured trace and telemetry records', async () => {
    const outputDir = await mkdtemp(path.join(tmpdir(), 'systemtrace-'));
    try {
      const adapter = new FileSystemTraceAdapter({ outputDir });
      const recorder = new SystemTraceRecorder({ adapter });

      await recorder.log({ message: 'loaded descriptor', severity: 'info' });
      await recorder.trace({ operation: 'descriptor-load', eventType: 'runtime.event' });
      await recorder.telemetry({ operation: 'duration', data: { value: 12 } });
      await recorder.flush();

      const jsonl = await readFile(adapter.traceFilePath, 'utf8');
      const records = jsonl.trim().split('\n').map((line) => JSON.parse(line) as SystemTraceRecord);
      expect(records.map((record) => record.family)).toEqual(['log', 'trace', 'telemetry']);
      expect(records[1]).toMatchObject({ operation: 'descriptor-load', eventType: 'runtime.event' });
      expect(records[2]).toMatchObject({ operation: 'duration', data: { value: 12 } });

      const humanLog = await readFile(adapter.logFilePath, 'utf8');
      expect(humanLog).toContain('loaded descriptor');
      expect(humanLog).toContain('descriptor-load');
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it('redacts unsafe context before adapter writes', async () => {
    const adapter = new MemoryAdapter();
    const recorder = new SystemTraceRecorder({ adapter });

    await recorder.trace({
      operation: 'credentials',
      context: {
        username: 'person',
        password: 'super-secret',
        nested: {
          accessToken: 'token-value',
        },
        rawPayload: {
          hidden: true,
        },
      },
    });

    expect(adapter.records[0].context).toEqual({
      username: 'person',
      password: '[REDACTED]',
      nested: {
        accessToken: '[REDACTED]',
      },
      rawPayload: '[REDACTED]',
    });
  });

  it('captures linked START and END span records with duration', async () => {
    const adapter = new MemoryAdapter();
    const recorder = new SystemTraceRecorder({ adapter });

    const value = await recorder.span(
      {
        operation: 'descriptor-load',
        source: {
          relativePath: 'src/modules/runtime-scaffold/ScaffoldExecutionLoader.ts',
          module: 'runtime-scaffold',
          className: 'ScaffoldExecutionLoader',
          method: 'loadFromControlFile',
        },
        topic: 'RuntimeScaffold',
        area: 'loader',
        rubric: 'descriptor',
        tags: ['runtime-scaffold'],
      },
      () => 42,
    );

    expect(value).toBe(42);
    const [start, end] = adapter.records;
    expect(start.phase).toBe('START');
    expect(end.phase).toBe('END');
    expect(start.traceId).toBe(end.traceId);
    expect(start.spanId).toBe(end.spanId);
    expect(end.timing?.durationMs).toEqual(expect.any(Number));
    expect(end.source).toMatchObject({ module: 'runtime-scaffold', className: 'ScaffoldExecutionLoader' });
    expect(end.tags).toEqual(['runtime-scaffold']);
  });

  it('closes failed spans with normalized error metadata and rethrows the original error', async () => {
    const adapter = new MemoryAdapter();
    const recorder = new SystemTraceRecorder({ adapter });
    const original = new Error('boom');

    await expect(
      recorder.span({ operation: 'failing-operation' }, () => {
        throw original;
      }),
    ).rejects.toBe(original);

    expect(adapter.records.at(-1)).toMatchObject({
      phase: 'END',
      status: 'error',
      error: {
        name: 'Error',
        message: 'boom',
      },
    });
  });

  it('supports bound tracer presets and records tags as arrays', async () => {
    const adapter = new MemoryAdapter();
    const recorder = new SystemTraceRecorder({ adapter });
    const tracer = recorder.createTracer({
      source: { module: 'runtime-scaffold' },
      topic: 'RuntimeScaffold',
      area: 'loader',
      rubric: 'descriptor',
      tags: ['bound'],
      presets: {
        load: {
          operation: 'descriptor-load',
          tags: ['preset'],
        },
      },
    });

    await tracer.record('load', { controlPath: '/tmp/control.json' });

    expect(adapter.records[0]).toMatchObject({
      operation: 'descriptor-load',
      topic: 'RuntimeScaffold',
      area: 'loader',
      rubric: 'descriptor',
      tags: ['bound', 'preset'],
    });
    expect(Array.isArray(adapter.records[0].tags)).toBe(true);
  });

  it('exposes adapter write failures instead of silently dropping records', async () => {
    const recorder = new SystemTraceRecorder({ adapter: new FailingAdapter() });

    const result = await recorder.trace({ operation: 'will-fail' });

    expect(result.ok).toBe(false);
    expect(recorder.getFailures()).toHaveLength(1);
  });
});
