import { describe, expect, it } from 'vitest';
import { ModuleLink } from '../../ModuleLink/index.js';
import { SystemTraceRecorder } from '../../SystemTrace/index.js';
import type { SystemTraceAdapter, SystemTraceRecord } from '../../SystemTrace/index.js';
import { ScaffoldExecutionLoader } from '../ScaffoldExecutionLoader.js';
import type { RuntimeScaffoldFileSystem } from '../types.js';

class FixtureFileSystem implements RuntimeScaffoldFileSystem {
  constructor(private readonly files: ReadonlyMap<string, string>) {}

  async readTextFile(filePath: string): Promise<string> {
    const contents = this.files.get(filePath);
    if (contents === undefined) {
      throw new Error(`Fixture file not found: ${filePath}`);
    }
    return contents;
  }
}

class MemoryTraceAdapter implements SystemTraceAdapter {
  readonly records: SystemTraceRecord[] = [];

  async append(record: SystemTraceRecord): Promise<void> {
    this.records.push(record);
  }

  async flush(): Promise<void> {}
}

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

const validBaseDescriptor = {
  id: 'rs-001-test-run',
  mode: 'flowOnly',
  tenantProcessRef: {
    kind: 'fixture',
    ref: 'test-tenant-process',
  },
  taskId: 'open-page-task',
  sourceStateRef: {
    kind: 'inline',
    value: {
      status: 'ready',
    },
  },
  execution: {
    flowId: 'open-page',
    input: {
      url: 'https://example.invalid',
    },
  },
  output: {
    outputDir: './runs/rs-001-test-run',
    writeTrace: true,
    writeResult: true,
    writeNextState: false,
  },
} as const;

const loadFixture = (files: Record<string, string>, controlPath = '/scaffold/control.json') => {
  return new ScaffoldExecutionLoader({
    fileSystem: new FixtureFileSystem(new Map(Object.entries(files))),
  }).loadFromControlFile(controlPath);
};

const tracedLoader = (files: Record<string, string>) => {
  const adapter = new MemoryTraceAdapter();
  const moduleLink = new ModuleLink({
    systemTraceRecorder: new SystemTraceRecorder({ adapter }),
  });
  const tracer = moduleLink.systemTrace.createTracer({
    source: {
      relativePath: 'src/modules/runtime-scaffold/ScaffoldExecutionLoader.ts',
      module: 'runtime-scaffold',
      className: 'ScaffoldExecutionLoader',
      method: 'loadFromControlFile',
    },
    topic: 'RuntimeScaffold',
    area: 'loader',
    rubric: 'descriptor-loading',
    tags: ['runtime-scaffold'],
    presets: {
      'descriptor-control-read': { operation: 'descriptor-control-read' },
      'descriptor-control-normalize': { operation: 'descriptor-control-normalize' },
      'descriptor-execution-path-resolve': { operation: 'descriptor-execution-path-resolve' },
      'descriptor-format-detect': { operation: 'descriptor-format-detect' },
      'descriptor-file-read': { operation: 'descriptor-file-read' },
      'descriptor-normalize': { operation: 'descriptor-normalize' },
    },
  });

  return {
    adapter,
    loader: new ScaffoldExecutionLoader({
      fileSystem: new FixtureFileSystem(new Map(Object.entries(files))),
      systemTraceTracer: tracer,
    }),
  };
};

describe('ScaffoldExecutionLoader', () => {
  it('loads a selected execution descriptor from a master control file', async () => {
    const result = await loadFixture({
      '/scaffold/control.json': json({ activeExecutionFile: './executions/flow-only.json' }),
      '/scaffold/executions/flow-only.json': json(validBaseDescriptor),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw result.error;
    }
    expect(result.controlPath).toBe('/scaffold/control.json');
    expect(result.executionPath).toBe('/scaffold/executions/flow-only.json');
    expect(result.executionFormat).toBe('json');
    expect(result.descriptorId).toBe('rs-001-test-run');
    expect(result.descriptor.id).toBe('rs-001-test-run');
    expect(result.descriptor.mode).toBe('flowOnly');
    expect(result.descriptor.taskId).toBe('open-page-task');
    expect(result.descriptor.execution?.flowId).toBe('open-page');
  });

  it('resolves the selected descriptor path relative to the control file directory', async () => {
    const result = await loadFixture(
      {
        '/workspace/scaffold/control.json': json({ activeExecutionFile: 'runs/descriptor.json' }),
        '/workspace/scaffold/runs/descriptor.json': json(validBaseDescriptor),
      },
      '/workspace/scaffold/control.json',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw result.error;
    }
    expect(result.executionPath).toBe('/workspace/scaffold/runs/descriptor.json');
  });

  it('normalizes legacy runId and params aliases without executing TenantProcess behavior', async () => {
    const result = await loadFixture({
      '/scaffold/control.json': json({ selectedExecutionFile: './legacy.json' }),
      '/scaffold/legacy.json': json({
        ...validBaseDescriptor,
        id: undefined,
        runId: 'legacy-run',
        execution: {
          flowId: 'legacy-flow',
          params: {
            legacy: true,
          },
        },
      }),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw result.error;
    }
    expect(result.descriptor.id).toBe('legacy-run');
    expect(result.descriptor.tenantProcessRef).toEqual({ kind: 'fixture', ref: 'test-tenant-process' });
    expect(result.descriptor.sourceStateRef).toEqual({ kind: 'inline', value: { status: 'ready' } });
    expect(result.descriptor.execution?.input).toEqual({ legacy: true });
  });

  it('normalizes channelFlow descriptors without resolving Channel, STO, or Flow semantics', async () => {
    const result = await loadFixture({
      '/scaffold/control.json': json({ activeExecutionFile: './channel-flow.json' }),
      '/scaffold/channel-flow.json': json({
        ...validBaseDescriptor,
        mode: 'channelFlow',
        execution: {
          channelId: 'incoming-document',
          stoId: 'classify-document-sto',
          input: {
            documentId: 'doc-1',
          },
        },
      }),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw result.error;
    }
    expect(result.descriptor.mode).toBe('channelFlow');
    expect(result.descriptor.execution?.channelId).toBe('incoming-document');
    expect(result.descriptor.execution?.stoId).toBe('classify-document-sto');
  });

  it('returns a structured failure for a missing control file', async () => {
    const result = await loadFixture({});

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('Expected missing control file to fail');
    }
    expect(result.error.code).toBe('CONTROL_FILE_READ_FAILED');
    expect(result.error.phase).toBe('control');
  });

  it('returns a structured failure for an unreadable control file', async () => {
    const result = await new ScaffoldExecutionLoader({
      fileSystem: {
        async readTextFile() {
          throw new Error('permission denied');
        },
      },
    }).loadFromControlFile('/scaffold/control.json');

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('Expected unreadable control file to fail');
    }
    expect(result.error.code).toBe('CONTROL_FILE_READ_FAILED');
  });

  it('returns a structured failure for an unparseable control file', async () => {
    const result = await loadFixture({
      '/scaffold/control.json': '{',
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('Expected unparseable control file to fail');
    }
    expect(result.error.code).toBe('CONTROL_FILE_PARSE_FAILED');
  });

  it('returns a structured failure for a missing selected descriptor path', async () => {
    const result = await loadFixture({
      '/scaffold/control.json': json({ activeExecutionFile: '' }),
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('Expected missing descriptor path to fail');
    }
    expect(result.error.code).toBe('CONTROL_FILE_INVALID');
  });

  it('returns a structured failure for an unreadable selected descriptor file', async () => {
    const result = await loadFixture({
      '/scaffold/control.json': json({ activeExecutionFile: './missing.json' }),
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('Expected unreadable descriptor to fail');
    }
    expect(result.executionPath).toBe('/scaffold/missing.json');
    expect(result.error.code).toBe('EXECUTION_FILE_READ_FAILED');
    expect(result.error.phase).toBe('execution');
  });

  it('returns a structured failure for an unparseable selected descriptor file', async () => {
    const result = await loadFixture({
      '/scaffold/control.json': json({ activeExecutionFile: './bad.json' }),
      '/scaffold/bad.json': '{',
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('Expected unparseable descriptor to fail');
    }
    expect(result.error.code).toBe('EXECUTION_FILE_PARSE_FAILED');
  });

  it('returns a structured failure for an unsupported selected descriptor format', async () => {
    const result = await loadFixture({
      '/scaffold/control.json': json({ activeExecutionFile: './descriptor.yaml' }),
      '/scaffold/descriptor.yaml': 'id: rs-001-test-run',
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('Expected unsupported descriptor format to fail');
    }
    expect(result.error.code).toBe('EXECUTION_FORMAT_UNSUPPORTED');
  });

  it('returns a structured failure when the descriptor cannot normalize to the scaffold descriptor shape', async () => {
    const result = await loadFixture({
      '/scaffold/control.json': json({ activeExecutionFile: './bad.json' }),
      '/scaffold/bad.json': json({
        ...validBaseDescriptor,
        id: undefined,
        runId: undefined,
      }),
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('Expected descriptor loading to fail');
    }
    expect(result.error.code).toBe('DESCRIPTOR_INVALID');
    expect(result.error.phase).toBe('normalization');
    expect(result.error.message).toContain('id');
  });

  it('rejects active execution paths that escape the control file directory', async () => {
    const result = await loadFixture({
      '/scaffold/control.json': json({ activeExecutionFile: '../outside.json' }),
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('Expected escaped execution path to fail');
    }
    expect(result.error.code).toBe('EXECUTION_PATH_INVALID');
  });

  it('emits SystemTrace spans through ModuleLink for descriptor loading and normalization', async () => {
    const { adapter, loader } = tracedLoader({
      '/scaffold/control.json': json({ activeExecutionFile: './executions/flow-only.json' }),
      '/scaffold/executions/flow-only.json': json(validBaseDescriptor),
    });

    const result = await loader.loadFromControlFile('/scaffold/control.json');

    expect(result.ok).toBe(true);
    const spanRecords = adapter.records.filter((record) => record.family === 'span');
    expect(spanRecords.some((record) => record.operation === 'descriptor-file-read' && record.phase === 'START')).toBe(true);
    expect(spanRecords.some((record) => record.operation === 'descriptor-normalize' && record.phase === 'END')).toBe(true);
    const descriptorLoadStart = spanRecords.find((record) => record.operation === 'descriptor-file-read' && record.phase === 'START');
    const descriptorLoadEnd = spanRecords.find((record) => record.operation === 'descriptor-file-read' && record.phase === 'END');
    expect(descriptorLoadStart?.traceId).toBe(descriptorLoadEnd?.traceId);
    expect(descriptorLoadStart?.spanId).toBe(descriptorLoadEnd?.spanId);
  });

  it('records RuntimeScaffold source identity and operation classification in trace spans', async () => {
    const { adapter, loader } = tracedLoader({
      '/scaffold/control.json': json({ activeExecutionFile: './executions/flow-only.json' }),
      '/scaffold/executions/flow-only.json': json(validBaseDescriptor),
    });

    await loader.loadFromControlFile('/scaffold/control.json');

    const endRecord = adapter.records.find((record) => record.operation === 'descriptor-normalize' && record.phase === 'END');
    expect(endRecord).toMatchObject({
      source: {
        relativePath: 'src/modules/runtime-scaffold/ScaffoldExecutionLoader.ts',
        module: 'runtime-scaffold',
        className: 'ScaffoldExecutionLoader',
        method: 'loadFromControlFile',
      },
      topic: 'RuntimeScaffold',
      area: 'loader',
      rubric: 'descriptor-loading',
    });
    expect(endRecord?.tags).toEqual(expect.arrayContaining(['runtime-scaffold', 'descriptor']));
    expect(Array.isArray(endRecord?.tags)).toBe(true);
  });

  it('closes RuntimeScaffold traced failure paths with END error status while preserving failure results', async () => {
    const { adapter, loader } = tracedLoader({
      '/scaffold/control.json': json({ activeExecutionFile: './bad.json' }),
      '/scaffold/bad.json': json({
        ...validBaseDescriptor,
        id: undefined,
        runId: undefined,
      }),
    });

    const result = await loader.loadFromControlFile('/scaffold/control.json');

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('Expected descriptor loading to fail');
    }
    expect(result.error.code).toBe('DESCRIPTOR_INVALID');
    expect(adapter.records.at(-1)).toMatchObject({
      operation: 'descriptor-normalize',
      phase: 'END',
      status: 'error',
    });
  });
});
