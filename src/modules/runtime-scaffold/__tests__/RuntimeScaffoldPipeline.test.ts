import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { runtimeSpineTenantProcess } from '../../../../Tenants/TaskStream/TenantProcess/runtime-spine-001/index.js';
import { RUNTIME_SPINE_TENANT_PROCESS_IDS } from '../../../../Tenants/TaskStream/TenantProcess/runtime-spine-001/ids.js';
import { reviewSubmissionStateDefinition } from '../../../../Tenants/TaskStream/TenantProcess/runtime-spine-001/stateDefinition.js';
import { startReviewFlow } from '../../../../Tenants/TaskStream/TenantProcess/runtime-spine-001/flows.js';
import { RuntimeScaffold } from '../RuntimeScaffold.js';
import { RuntimeScaffoldExecutor } from '../RuntimeScaffoldExecutor.js';
import type { RuntimeScaffoldPipelineStageName } from '../RuntimeScaffoldPipelineTypes.js';
import { ScaffoldFlowRunner } from '../ScaffoldFlowRunner.js';
import { TenantProcessLoader } from '../TenantProcessLoader.js';
import { adaptTenantProcessForRuntimeScaffold } from '../TenantProcessRuntimeAdapter.js';
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

class RecordingFlowRunner extends ScaffoldFlowRunner {
  calls = 0;

  override async run(input: Parameters<ScaffoldFlowRunner['run']>[0]) {
    this.calls += 1;
    return super.run(input);
  }
}

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

const baseState = () => ({
  status: 'pending',
  score: 74,
  reviewed: false,
  reviewerNotes: '',
  flags: [],
});

const createRuntimeSpineDescriptor = (overrides: Record<string, unknown> = {}) => ({
  id: 'runtime-scaffold-pipeline-test-run',
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
      reviewerId: 'pipeline-reviewer',
    },
  },
  ...overrides,
});

const createRuntimeScaffold = ({
  descriptor = createRuntimeSpineDescriptor(),
  stageObserver,
  flowRunner,
  tenantProcessFixtures = {
    [RUNTIME_SPINE_TENANT_PROCESS_IDS.tenantProcess]: runtimeSpineTenantProcess,
  },
}: {
  readonly descriptor?: Record<string, unknown>;
  readonly stageObserver?: (stageName: RuntimeScaffoldPipelineStageName) => void;
  readonly flowRunner?: ScaffoldFlowRunner;
  readonly tenantProcessFixtures?: Readonly<Record<string, unknown>>;
} = {}) => {
  const fileSystem = new FixtureFileSystem(new Map(Object.entries({
    '/runtime-scaffold-pipeline/control.json': json({ activeExecutionFile: './execution.json' }),
    '/runtime-scaffold-pipeline/execution.json': json(descriptor),
  })));
  const executor = new RuntimeScaffoldExecutor({
    fileSystem,
    flowRunner,
    stageObserver,
    tenantProcessLoader: new TenantProcessLoader({
      fileSystem,
      fixtures: tenantProcessFixtures,
    }),
  });

  return new RuntimeScaffold({
    fileSystem,
    executor,
  });
};

describe('TaskStream / RuntimeScaffold / Explicit Execution Pipeline', () => {
  it('[tickets: RSC-PIPELINE-001] runtime-scaffold executes through explicit ordered pipeline stages', async () => {
    const stages: RuntimeScaffoldPipelineStageName[] = [];
    const runtimeScaffold = createRuntimeScaffold({
      stageObserver(stageName) {
        stages.push(stageName);
      },
    });

    const result = await runtimeScaffold.executeFromControlFile('/runtime-scaffold-pipeline/control.json');

    expect(result.ok).toBe(true);
    expect(stages).toEqual(['load', 'resolve', 'prepare', 'execute', 'validate', 'output']);
  });

  it('[tickets: RSC-PIPELINE-001] runtime-scaffold confines TenantProcess shape adaptation to one boundary', () => {
    const authored = adaptTenantProcessForRuntimeScaffold(runtimeSpineTenantProcess);
    const canonical = adaptTenantProcessForRuntimeScaffold({
      tenantProcessId: RUNTIME_SPINE_TENANT_PROCESS_IDS.tenantProcess,
      tasks: {
        [RUNTIME_SPINE_TENANT_PROCESS_IDS.task]: {
          taskId: RUNTIME_SPINE_TENANT_PROCESS_IDS.task,
          stateDefinitionRef: RUNTIME_SPINE_TENANT_PROCESS_IDS.stateDefinition,
          stoRefs: [RUNTIME_SPINE_TENANT_PROCESS_IDS.stos.startReview],
          defaultStoRef: RUNTIME_SPINE_TENANT_PROCESS_IDS.stos.startReview,
        },
      },
      stos: {
        [RUNTIME_SPINE_TENANT_PROCESS_IDS.stos.startReview]: {
          stoId: RUNTIME_SPINE_TENANT_PROCESS_IDS.stos.startReview,
          taskRef: RUNTIME_SPINE_TENANT_PROCESS_IDS.task,
          flowRef: RUNTIME_SPINE_TENANT_PROCESS_IDS.flows.startReview,
        },
      },
      flows: {
        [RUNTIME_SPINE_TENANT_PROCESS_IDS.flows.startReview]: {
          flowId: RUNTIME_SPINE_TENANT_PROCESS_IDS.flows.startReview,
          executable: startReviewFlow,
        },
      },
      stateDefinitions: {
        [RUNTIME_SPINE_TENANT_PROCESS_IDS.stateDefinition]: reviewSubmissionStateDefinition,
      },
    });

    expect(authored.tasks[0]).toMatchObject({
      taskId: RUNTIME_SPINE_TENANT_PROCESS_IDS.task,
      defaultStoId: RUNTIME_SPINE_TENANT_PROCESS_IDS.stos.startReview,
    });
    expect(canonical.tasks[0]).toMatchObject({
      taskId: RUNTIME_SPINE_TENANT_PROCESS_IDS.task,
      defaultStoId: RUNTIME_SPINE_TENANT_PROCESS_IDS.stos.startReview,
    });
    expect(canonical.tasks[0]?.stos[0]).toMatchObject({
      stoId: RUNTIME_SPINE_TENANT_PROCESS_IDS.stos.startReview,
      declaredFlowId: RUNTIME_SPINE_TENANT_PROCESS_IDS.flows.startReview,
      flow: {
        flowId: RUNTIME_SPINE_TENANT_PROCESS_IDS.flows.startReview,
      },
    });

    for (const { file, contents } of runtimeScaffoldSourceFilesWithoutAdapter()) {
      expect(contents, file).not.toMatch(/valuesFromRegistryOrArray|runtimeId\(|Object\.values\(/);
      expect(contents, file).not.toMatch(/\?\?\s*[a-zA-Z0-9_.[\]]+\.id/);
      expect(contents, file).not.toMatch(/\b(stoRefs|defaultStoRef|flowRef)\b/);
    }
  });

  it('[tickets: RSC-PIPELINE-001] runtime-scaffold stops after a failed pipeline stage', async () => {
    const stages: RuntimeScaffoldPipelineStageName[] = [];
    const runtimeScaffold = createRuntimeScaffold({
      descriptor: createRuntimeSpineDescriptor({
        tenantProcessRef: {
          kind: 'fixture',
          ref: 'missing-tenant-process',
        },
      }),
      stageObserver(stageName) {
        stages.push(stageName);
      },
    });

    const result = await runtimeScaffold.executeFromControlFile('/runtime-scaffold-pipeline/control.json');

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('Expected pipeline load stage to fail');
    }
    expect(result.error).toMatchObject({
      code: 'TENANT_PROCESS_NOT_FOUND',
      phase: 'tenant-process',
    });
    expect(stages).toEqual(['load']);
  });

  it('[tickets: RSC-PIPELINE-001] runtime-scaffold invokes Flow only through ScaffoldFlowRunner', async () => {
    const flowRunner = new RecordingFlowRunner();
    const runtimeScaffold = createRuntimeScaffold({ flowRunner });

    const result = await runtimeScaffold.executeFromControlFile('/runtime-scaffold-pipeline/control.json');

    expect(result.ok).toBe(true);
    expect(flowRunner.calls).toBe(1);

    const directFlowCallFiles = runtimeScaffoldSourceFiles()
      .filter(({ file }) => file !== 'ScaffoldFlowRunner.ts')
      .filter(({ contents }) => contents.includes('.executable('))
      .map(({ file }) => file);
    expect(directFlowCallFiles).toEqual([]);
  });

  it('[tickets: RSC-PIPELINE-001, RUNTIME-SPINE-001] explicit pipeline preserves flowOnly runtime-spine behavior and evidence', async () => {
    const runtimeScaffold = createRuntimeScaffold();

    const result = await runtimeScaffold.executeFromControlFile('/runtime-scaffold-pipeline/control.json');

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw result.error;
    }
    expect(result).toMatchObject({
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
          reviewerId: 'pipeline-reviewer',
        },
      },
    });
    expect(result.previousState).toEqual(baseState());
    expect(result.proposedState).toEqual({
      ...baseState(),
      status: 'in_review',
      reviewerNotes: 'Review started by pipeline-reviewer',
    });
  });
});

function runtimeScaffoldSourceFilesWithoutAdapter() {
  return runtimeScaffoldSourceFiles().filter(({ file }) => file !== 'TenantProcessRuntimeAdapter.ts');
}

function runtimeScaffoldSourceFiles() {
  const runtimeScaffoldDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
  );

  return readdirSync(runtimeScaffoldDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
    .map((entry) => ({
      file: entry.name,
      contents: readFileSync(path.join(runtimeScaffoldDir, entry.name), 'utf8'),
    }));
}
