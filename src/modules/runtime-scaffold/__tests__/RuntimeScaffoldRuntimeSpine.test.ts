import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ModuleLink } from '../../ModuleLink/index.js';
import { SystemTraceRecorder } from '../../SystemTrace/index.js';
import type { SystemTraceAdapter, SystemTraceRecord } from '../../SystemTrace/index.js';
import { runtimeSpineTenantProcess } from '../../../../Tenants/TaskStream/TenantProcess/runtime-spine-001/index.js';
import { RUNTIME_SPINE_TENANT_PROCESS_IDS } from '../../../../Tenants/TaskStream/TenantProcess/runtime-spine-001/ids.js';
import { RUNTIME_SCAFFOLD_TRACE_EVENTS } from '../../../trace-events/index.js';
import { RuntimeScaffold } from '../RuntimeScaffold.js';
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

const baseState = () => ({
  status: 'pending',
  score: 74,
  reviewed: false,
  reviewerNotes: '',
  flags: [],
});

const runtimeSpineRequirements = [
  'REQ-RSC-002',
  'REQ-RSC-003',
  'REQ-RSC-004',
  'REQ-RSC-005',
  'REQ-RSC-006',
  'REQ-RSC-008',
  'REQ-RSC-016',
  'REQ-SC-001',
  'REQ-SC-007',
] as const;

const runtimeSpineLabels = [
  { name: 'verificationSet', value: 'runtime-spine-v1' },
  { name: 'ticket', value: 'RUNTIME-SPINE-001' },
  ...runtimeSpineRequirements.map((requirement) => ({ name: 'requirement', value: requirement })),
  { name: 'ownerType', value: 'concept' },
  { name: 'owner', value: 'RuntimeScaffold' },
  { name: 'testConcern', value: 'flowOnly-runtime-spine' },
  { name: 'runtimeSlice', value: 'flowonly-runtime-spine-v1' },
] as const;

const runtimeEvents = RUNTIME_SCAFFOLD_TRACE_EVENTS.runtimeSpine;

const createRuntimeSpineDescriptor = (outputDir: string, overrides: Record<string, unknown> = {}) => ({
  id: 'runtime-spine-001-test-run',
  mode: 'flowOnly',
  tenantProcessRef: {
    kind: 'fixture',
    ref: RUNTIME_SPINE_TENANT_PROCESS_IDS.tenantProcess,
  },
  taskId: RUNTIME_SPINE_TENANT_PROCESS_IDS.task,
  sourceStateRef: {
    kind: 'inline',
    value: baseState(),
  },
  execution: {
    flowId: RUNTIME_SPINE_TENANT_PROCESS_IDS.flows.startReview,
    input: {
      reviewerId: 'runtime-spine-reviewer',
    },
  },
  output: {
    outputDir,
    writeTrace: true,
    writeResult: true,
    writeNextState: true,
  },
  ...overrides,
});

const tracedRuntimeScaffold = (files: Record<string, string>, sourceStateFixtures: Record<string, unknown> = {}) => {
  const adapter = new MemoryTraceAdapter();
  const moduleLink = new ModuleLink({
    systemTraceRecorder: new SystemTraceRecorder({ adapter }),
  });
  const tracer = moduleLink.systemTrace.createTracer({
    source: {
      relativePath: 'src/modules/runtime-scaffold/RuntimeScaffoldExecutor.ts',
      module: 'runtime-scaffold',
      className: 'RuntimeScaffoldExecutor',
      method: 'executeLoaded',
    },
    topic: 'RuntimeScaffold',
    area: 'runtime-spine',
    rubric: 'flowOnly',
    tags: ['runtime-scaffold'],
  });

  return {
    adapter,
    runtimeScaffold: new RuntimeScaffold({
      fileSystem: new FixtureFileSystem(new Map(Object.entries(files))),
      systemTraceTracer: tracer,
      tenantProcessFixtures: {
        [RUNTIME_SPINE_TENANT_PROCESS_IDS.tenantProcess]: runtimeSpineTenantProcess,
      },
      sourceStateFixtures,
    }),
  };
};

describe('TaskStream / RuntimeScaffold / Runtime Spine', () => {
  it('[tickets: RUNTIME-SPINE-001] flowOnly runtime spine executes a deterministic TenantProcess Flow', async () => {
    const outputDir = await mkdtemp(path.join(tmpdir(), 'runtime-spine-result-'));
    const descriptor = createRuntimeSpineDescriptor(outputDir);
    const { adapter, runtimeScaffold } = tracedRuntimeScaffold({
      '/runtime-spine/control.json': json({ activeExecutionFile: './execution.json' }),
      '/runtime-spine/execution.json': json(descriptor),
    });

    const result = await runtimeScaffold.executeFromControlFile('/runtime-spine/control.json');

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw result.error;
    }
    expect(result).toMatchObject({
      descriptorId: descriptor.id,
      mode: 'flowOnly',
      taskId: RUNTIME_SPINE_TENANT_PROCESS_IDS.task,
      selectedStoId: RUNTIME_SPINE_TENANT_PROCESS_IDS.stos.startReview,
      selectedFlowId: RUNTIME_SPINE_TENANT_PROCESS_IDS.flows.startReview,
      validation: {
        valid: true,
        target: 'proposedState',
      },
      flowResult: {
        status: 'succeeded',
        result: {
          kind: 'review-started',
          reviewerId: 'runtime-spine-reviewer',
        },
      },
    });
    expect(result.previousState).toEqual(baseState());
    expect(result.proposedState).toEqual({
      ...baseState(),
      status: 'in_review',
      reviewerNotes: 'Review started by runtime-spine-reviewer',
    });
    expect(adapter.records.some((record) => record.operation === runtimeEvents.flowExecute && record.phase === 'END')).toBe(true);
  });

  it('[tickets: RUNTIME-SPINE-001] flowOnly runtime spine rejects missing TenantProcess or Task before execution', async () => {
    const outputDir = await mkdtemp(path.join(tmpdir(), 'runtime-spine-failure-'));
    const missingTenantDescriptor = createRuntimeSpineDescriptor(outputDir, {
      tenantProcessRef: {
        kind: 'fixture',
        ref: 'missing-tenant-process',
      },
    });
    const missingTaskDescriptor = createRuntimeSpineDescriptor(outputDir, {
      taskId: 'task.missing',
    });

    const missingTenant = tracedRuntimeScaffold({
      '/runtime-spine/control.json': json({ activeExecutionFile: './missing-tenant.json' }),
      '/runtime-spine/missing-tenant.json': json(missingTenantDescriptor),
    });
    const missingTask = tracedRuntimeScaffold({
      '/runtime-spine/control.json': json({ activeExecutionFile: './missing-task.json' }),
      '/runtime-spine/missing-task.json': json(missingTaskDescriptor),
    });

    const missingTenantResult = await missingTenant.runtimeScaffold.executeFromControlFile('/runtime-spine/control.json');
    const missingTaskResult = await missingTask.runtimeScaffold.executeFromControlFile('/runtime-spine/control.json');

    expect(missingTenantResult.ok).toBe(false);
    if (missingTenantResult.ok) {
      throw new Error('Expected missing TenantProcess to fail');
    }
    expect(missingTenantResult.error).toMatchObject({
      code: 'TENANT_PROCESS_NOT_FOUND',
      phase: 'tenant-process',
    });
    expect(missingTenant.adapter.records.some((record) => record.operation === runtimeEvents.flowExecute)).toBe(false);

    expect(missingTaskResult.ok).toBe(false);
    if (missingTaskResult.ok) {
      throw new Error('Expected missing Task to fail');
    }
    expect(missingTaskResult.error).toMatchObject({
      code: 'TASK_NOT_FOUND',
      phase: 'task-resolution',
    });
    expect(missingTask.adapter.records.some((record) => record.operation === runtimeEvents.flowExecute)).toBe(false);
  });

  it('[tickets: RUNTIME-SPINE-001] flowOnly runtime spine isolates previousState from proposedState', async () => {
    const outputDir = await mkdtemp(path.join(tmpdir(), 'runtime-spine-isolation-'));
    const sourceState = baseState();
    const descriptor = createRuntimeSpineDescriptor(outputDir, {
      sourceStateRef: {
        kind: 'inline',
        value: sourceState,
      },
    });
    const { runtimeScaffold } = tracedRuntimeScaffold({
      '/runtime-spine/control.json': json({ activeExecutionFile: './execution.json' }),
      '/runtime-spine/execution.json': json(descriptor),
    });

    const result = await runtimeScaffold.executeFromControlFile('/runtime-spine/control.json');

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw result.error;
    }
    expect(sourceState).toEqual(baseState());
    expect(result.previousState).toEqual(baseState());
    expect(result.previousState).not.toBe(result.proposedState);
    expect(result.proposedState).toMatchObject({
      status: 'in_review',
      reviewerNotes: 'Review started by runtime-spine-reviewer',
    });
  });

  it('[tickets: RUNTIME-SPINE-001] flowOnly runtime spine writes result and trace evidence', async () => {
    const outputDir = await mkdtemp(path.join(tmpdir(), 'runtime-spine-evidence-'));
    const descriptor = createRuntimeSpineDescriptor(outputDir);
    const { adapter, runtimeScaffold } = tracedRuntimeScaffold({
      '/runtime-spine/control.json': json({ activeExecutionFile: './execution.json' }),
      '/runtime-spine/execution.json': json(descriptor),
    });

    const result = await runtimeScaffold.executeFromControlFile('/runtime-spine/control.json');

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw result.error;
    }
    const resultArtifactRef = requireArtifactRef(result.resultArtifactRef, 'resultArtifactRef');
    const traceRef = requireArtifactRef(result.traceRef, 'traceRef');
    const proposedStateArtifactRef = requireArtifactRef(result.proposedStateArtifactRef, 'proposedStateArtifactRef');

    expect(resultArtifactRef).toBe(path.join(outputDir, 'runtime-spine-result.json'));
    expect(traceRef).toBe(path.join(outputDir, 'runtime-spine-trace-summary.json'));
    expect(proposedStateArtifactRef).toBe(path.join(outputDir, 'runtime-spine-proposed-state.json'));
    expect(existsSync(resultArtifactRef)).toBe(true);
    expect(existsSync(traceRef)).toBe(true);
    expect(JSON.parse(readFileSync(resultArtifactRef, 'utf8'))).toMatchObject({
      descriptorId: descriptor.id,
      selectedFlowId: RUNTIME_SPINE_TENANT_PROCESS_IDS.flows.startReview,
      validation: {
        valid: true,
      },
    });
    const traceSummary = JSON.parse(readFileSync(traceRef, 'utf8'));
    expect(traceSummary.operations).toEqual(expect.arrayContaining([
      runtimeEvents.tenantProcessLoad,
      runtimeEvents.taskResolve,
      runtimeEvents.flowExecute,
      runtimeEvents.resultWrite,
    ]));
    expect(adapter.records.some((record) => record.operation === runtimeEvents.resultWrite && record.phase === 'END')).toBe(true);

    emitAllureEvidenceResult({
      suite: 'TaskStream / RuntimeScaffold / Runtime Spine',
      name: 'flowOnly runtime spine evidence: result and trace artifacts',
      attachmentName: 'runtime-spine-result.json',
      attachment: {
        result: JSON.parse(readFileSync(resultArtifactRef, 'utf8')),
        traceSummary,
        traceRecordCount: adapter.records.length,
      },
      labels: runtimeSpineLabels,
    });
  });
});

function requireArtifactRef(value: string | undefined, label: string): string {
  if (!value) {
    throw new Error(`Expected RuntimeScaffold to write ${label}`);
  }
  return value;
}

function emitAllureEvidenceResult({
  suite,
  name,
  attachmentName,
  attachment,
  labels,
}: {
  readonly suite: string;
  readonly name: string;
  readonly attachmentName: string;
  readonly attachment: unknown;
  readonly labels: readonly { readonly name: string; readonly value: string }[];
}) {
  const resultsDir = path.resolve(process.env.ALLURE_RESULTS_DIR ?? 'allure-results');
  mkdirSync(resultsDir, { recursive: true });

  const now = Date.now();
  const testUuid = randomUUID();
  const containerUuid = randomUUID();
  const attachmentSource = `${randomUUID()}-attachment.json`;
  writeFileSync(path.join(resultsDir, attachmentSource), `${JSON.stringify(attachment, null, 2)}\n`);

  const visibleName = withTicketSuffix(name, labels);
  const fullName = withTicketSuffix(`${suite} :: ${name}`, labels);
  const resultPayload = {
    uuid: testUuid,
    historyId: createHash('md5').update(fullName).digest('hex'),
    name: visibleName,
    fullName,
    status: 'passed',
    stage: 'finished',
    steps: [],
    attachments: [
      {
        name: attachmentName,
        source: attachmentSource,
        type: 'application/json',
      },
    ],
    parameters: metadataParameters(labels),
    labels: [
      { name: 'language', value: 'TypeScript' },
      { name: 'framework', value: 'vitest' },
      { name: 'suite', value: suite },
      { name: 'package', value: 'src/modules/runtime-scaffold' },
      ...labels,
      ...metadataTagLabels(labels),
    ],
    start: now,
    stop: now,
  };
  const containerPayload = {
    uuid: containerUuid,
    name: suite,
    children: [testUuid],
    befores: [],
    afters: [],
    start: now,
    stop: now,
  };

  writeFileSync(path.join(resultsDir, `${testUuid}-result.json`), `${JSON.stringify(resultPayload, null, 2)}\n`);
  writeFileSync(path.join(resultsDir, `${containerUuid}-container.json`), `${JSON.stringify(containerPayload, null, 2)}\n`);
}

function labelValues(labels: readonly { readonly name: string; readonly value: string }[], name: string) {
  return labels.filter((label) => label.name === name).map((label) => label.value);
}

function withTicketSuffix(value: string, labels: readonly { readonly name: string; readonly value: string }[]) {
  const tickets = labelValues(labels, 'ticket');
  return tickets.length > 0 ? `${value} [tickets: ${tickets.join(',')}]` : value;
}

function metadataParameters(labels: readonly { readonly name: string; readonly value: string }[]) {
  return labels
    .filter((label) => ['verificationSet', 'ticket', 'requirement', 'ownerType', 'owner', 'testConcern', 'runtimeSlice'].includes(label.name))
    .map((label) => ({ name: label.name, value: label.value }));
}

function metadataTagLabels(labels: readonly { readonly name: string; readonly value: string }[]) {
  return labels.flatMap((label) => {
    if (!['verificationSet', 'ticket', 'requirement', 'testConcern', 'runtimeSlice'].includes(label.name)) {
      return [];
    }
    return label.name === 'ticket'
      ? [
          { name: 'tag', value: label.value },
          { name: 'tag', value: `ticket:${label.value}` },
        ]
      : [{ name: 'tag', value: `${label.name}:${label.value}` }];
  });
}
