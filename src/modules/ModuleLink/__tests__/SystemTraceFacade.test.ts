import { describe, expect, it } from 'vitest';
import { SystemTraceRecorder } from '../../SystemTrace/index.js';
import type { SystemTraceAdapter, SystemTraceRecord } from '../../SystemTrace/index.js';
import { ModuleLink } from '../index.js';

class MemoryAdapter implements SystemTraceAdapter {
  readonly records: SystemTraceRecord[] = [];

  async append(record: SystemTraceRecord): Promise<void> {
    this.records.push(record);
  }

  async flush(): Promise<void> {}
}

describe('ModuleLink SystemTrace facade', () => {
  it('routes records to an imported SystemTrace library through the direct route', async () => {
    const adapter = new MemoryAdapter();
    const moduleLink = new ModuleLink({
      systemTraceRecorder: new SystemTraceRecorder({ adapter }),
    });

    const result = await moduleLink.systemTrace.record({
      operation: 'descriptor-load',
      topic: 'RuntimeScaffold',
    });

    expect(result.ok).toBe(true);
    expect(adapter.records[0]).toMatchObject({
      family: 'trace',
      operation: 'descriptor-load',
      topic: 'RuntimeScaffold',
    });
  });

  it('routes linked START and END span records', async () => {
    const adapter = new MemoryAdapter();
    const moduleLink = new ModuleLink({
      systemTraceRecorder: new SystemTraceRecorder({ adapter }),
    });

    const value = await moduleLink.systemTrace.span({ operation: 'descriptor-load' }, () => 'ok');

    expect(value).toBe('ok');
    expect(adapter.records.map((record) => record.phase)).toEqual(['START', 'END']);
    expect(adapter.records[0].traceId).toBe(adapter.records[1].traceId);
    expect(adapter.records[0].spanId).toBe(adapter.records[1].spanId);
  });

  it('supports bound tracer presets and small operation-key callsites', async () => {
    const adapter = new MemoryAdapter();
    const moduleLink = new ModuleLink({
      systemTraceRecorder: new SystemTraceRecorder({ adapter }),
    });
    const tracer = moduleLink.systemTrace.createTracer({
      source: { module: 'runtime-scaffold', className: 'ScaffoldExecutionLoader' },
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
      source: { module: 'runtime-scaffold', className: 'ScaffoldExecutionLoader' },
      topic: 'RuntimeScaffold',
      area: 'loader',
      rubric: 'descriptor',
      tags: ['bound', 'preset'],
    });
  });

  it('routes END with error status when wrapped calls throw and preserves the original error', async () => {
    const adapter = new MemoryAdapter();
    const moduleLink = new ModuleLink({
      systemTraceRecorder: new SystemTraceRecorder({ adapter }),
    });
    const original = new Error('boom');

    await expect(
      moduleLink.systemTrace.span({ operation: 'failing-operation' }, () => {
        throw original;
      }),
    ).rejects.toBe(original);

    expect(adapter.records.at(-1)).toMatchObject({
      phase: 'END',
      status: 'error',
      error: {
        message: 'boom',
      },
    });
  });
});
