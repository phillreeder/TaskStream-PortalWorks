import { randomUUID } from 'node:crypto';
import { StateContainer } from '../../definitionRuntime/state/index.js';
import type {
  ComposedTenantProcessDefinition,
  ComposedTenantProcessTask,
  FlowResult,
} from '../../domain/tenantProcess/index.js';
import {
  createFlatRuntimeAccessors,
  type FlatRuntimeSession,
  type FlatRuntimeTraceWriter,
} from './FlatRuntimeAccessors.js';
import {
  FlatRuntimeFileStore,
  type FlatRuntimeCycleRecord,
  type FlatRuntimeRunRecord,
  type FlatRuntimeStatus,
  type FlatRuntimeStoredUnit,
  type FlatRuntimeStreamRecord,
} from './FlatRuntimeStore.js';
import {
  runFlatRuntimeStream,
  type FlatRuntimeStreamResult,
} from './FlatRuntimeStreamRunner.js';
import { createScaffoldFlowContextForExecution } from './ScaffoldFlowContext.js';
import { createFlatRuntimeWebRuntime } from './FlatRuntimeWeb.js';
import { loadScaffoldWebAccessor } from './flow-context/accessors/web.js';
import type { RuntimeScaffoldWebOptions } from './types.js';

export interface FlatRuntimePathwayInput {
  readonly tenantProcess: ComposedTenantProcessDefinition;
  readonly taskRef: string;
  readonly input?: Record<string, unknown>;
  readonly initialState?: Record<string, unknown>;
  readonly artifactBasePath?: string;
  readonly configDirectory?: string;
  readonly web?: RuntimeScaffoldWebOptions;
  readonly runtimeRoot: string;
  readonly runId?: string;
  readonly maxStepsPerStream?: number;
}

export interface FlatRuntimePathwayResult {
  readonly runId: string;
  readonly cycleId: string;
  readonly taskRef: string;
  readonly status: 'succeeded' | 'blocked' | 'failed';
  readonly activationResult: FlowResult;
  readonly unitIds: readonly string[];
  readonly streamResults: readonly FlatRuntimeStreamResult[];
  readonly runDirectory: string;
  readonly evidenceArchives: readonly string[];
  readonly reason?: string;
}

/**
 * Direct TaskStream pathway hosted by RuntimeScaffold.
 *
 * Canonical Task activation, Channel selection, STO resolution and Flow
 * execution run in memory. Runtime data is checkpointed through one
 * filesystem store. No queues, workers, claims or database tables exist in
 * this pathway.
 */
export class FlatRuntimePathway {
  async run(input: FlatRuntimePathwayInput): Promise<FlatRuntimePathwayResult> {
    const task = resolveTask(input.tenantProcess, input.taskRef);
    const maxSteps = normalizeMaxSteps(input.maxStepsPerStream);
    const runId = input.runId?.trim() || randomUUID();
    const cycleId = randomUUID();
    const now = new Date().toISOString();
    const store = new FlatRuntimeFileStore(input.runtimeRoot);
    const session: FlatRuntimeSession = {
      runId,
      cycleId,
      taskRef: input.taskRef,
      input: input.input ?? {},
      units: new Map(),
      artifacts: new Map(),
    };
    const trace: FlatRuntimeTraceWriter = (phase, event, data) => store.appendTrace({
      timestamp: new Date().toISOString(),
      runId,
      cycleId,
      taskRef: input.taskRef,
      ...(session.currentStreamId ? { streamId: session.currentStreamId } : {}),
      phase,
      event,
      ...(data === undefined ? {} : { data }),
    });
    const webRuntime = input.web
      ? await createFlatRuntimeWebRuntime({
        options: input.web,
        configDirectory: input.configDirectory ?? input.artifactBasePath ?? process.cwd(),
        store,
        session,
        trace,
      })
      : undefined;
    const accessors = createFlatRuntimeAccessors({
      store,
      session,
      trace,
      artifactBasePath: input.artifactBasePath ?? process.cwd(),
      web: webRuntime?.accessor ?? loadScaffoldWebAccessor(),
    });
    try {
    const initialState = cloneRecord(input.initialState ?? task.stateDefinition.defaults);

    let runRecord: FlatRuntimeRunRecord = {
      runId,
      tenantProcess: `${input.tenantProcess.id.tenant}/${input.tenantProcess.id.process}`,
      taskRef: input.taskRef,
      status: 'activating',
      cycleId,
      unitIds: [],
      streamIds: [],
      startedAt: now,
      updatedAt: now,
    };
    let cycleRecord: FlatRuntimeCycleRecord = {
      cycleId,
      runId,
      taskRef: input.taskRef,
      status: 'activating',
      unitIds: [],
      streamIds: [],
      createdAt: now,
      updatedAt: now,
    };

    await store.saveRun(runRecord);
    await store.saveCycle(cycleRecord);
    await trace('activation', 'started', { flowRef: task.activationFlow.flowId });

    const activationResult = await task.activationFlow.executable(
      createScaffoldFlowContextForExecution({
        taskRef: input.taskRef,
        binding: { kind: 'task-activation', flowRef: task.activationFlow.flowId },
        container: createStateContainer(task, initialState),
        authority: 'edge',
        flowPermissions: input.tenantProcess.flowPermissions,
        flowRef: task.activationFlow.flowId,
        accessors,
      }),
      session.input as Record<string, any>,
    );

    await trace('activation', 'completed', {
      flowRef: task.activationFlow.flowId,
      status: activationResult.status,
      unitsCreated: session.units.size,
      result: activationResult.result,
      metadata: activationResult.metadata,
    });

    if (activationResult.status !== 'succeeded') {
      const status = activationResult.status === 'retry' ? 'blocked' : 'failed';
      const reason = activationResult.reason ?? `Activation Flow returned ${activationResult.status}`;
      await persistFinalStatus(store, runRecord, cycleRecord, status, [], [], reason);
      return result({ input, store, runId, cycleId, status, activationResult, reason, evidenceArchives: webRuntime?.archives });
    }

    const units = [...session.units.values()];
    if (units.length === 0) {
      const reason = `Task activation Flow ${task.activationFlow.flowId} succeeded without creating a Unit`;
      await persistFinalStatus(store, runRecord, cycleRecord, 'failed', [], [], reason);
      return result({ input, store, runId, cycleId, status: 'failed', activationResult, reason, evidenceArchives: webRuntime?.archives });
    }

    const streams = units.map((unit) => createStreamRecord(session, unit));
    for (const stream of streams) {
      await store.saveStream(stream);
      await store.saveStreamState(runId, stream.streamId, initialState);
    }

    const unitIds = units.map((unit) => unit.unitId);
    const streamIds = streams.map((stream) => stream.streamId);
    runRecord = updateRun(runRecord, 'running', unitIds, streamIds);
    cycleRecord = updateCycle(cycleRecord, 'running', unitIds, streamIds);
    await store.saveRun(runRecord);
    await store.saveCycle(cycleRecord);

    const streamResults: FlatRuntimeStreamResult[] = [];
    for (const stream of streams) {
      streamResults.push(await runFlatRuntimeStream({
        tenantProcess: input.tenantProcess,
        task,
        stream,
        initialState,
        maxSteps,
        store,
        session,
        accessors,
        trace,
      }));
    }

    const status = aggregateStatus(streamResults);
    const reason = status === 'succeeded'
      ? undefined
      : streamResults.find((streamResult) => streamResult.status === status)?.reason;
    await persistFinalStatus(store, runRecord, cycleRecord, status, unitIds, streamIds, reason);
    await trace('run', 'completed', { status, reason });

    return result({
      input,
      store,
      runId,
      cycleId,
      status,
      activationResult,
      unitIds,
      streamResults,
      reason,
      evidenceArchives: webRuntime?.archives,
    });
    } finally {
      await webRuntime?.close();
    }
  }
}

function resolveTask(
  tenantProcess: ComposedTenantProcessDefinition,
  taskRef: string,
): ComposedTenantProcessTask {
  const task = tenantProcess.tasks[taskRef];
  if (!task) throw new Error(`Flat RuntimeScaffold Task not found: ${taskRef}`);
  if (!task.activationFlow || typeof task.activationFlow.executable !== 'function') {
    throw new Error(`Flat RuntimeScaffold Task ${taskRef} does not expose activationFlow`);
  }
  if (!task.channel || typeof task.channel.executable !== 'function') {
    throw new Error(`Flat RuntimeScaffold Task ${taskRef} does not expose a Channel`);
  }
  return task;
}

function createStateContainer(
  task: ComposedTenantProcessTask,
  initialState?: Record<string, unknown>,
): StateContainer {
  return new StateContainer({
    definition: task.stateDefinition,
    ...(initialState ? { state: initialState as any } : {}),
  });
}

function createStreamRecord(
  session: FlatRuntimeSession,
  unit: FlatRuntimeStoredUnit,
): FlatRuntimeStreamRecord {
  const now = new Date().toISOString();
  return {
    streamId: randomUUID(),
    runId: session.runId,
    cycleId: session.cycleId,
    taskRef: session.taskRef,
    unitId: unit.unitId,
    status: 'ready',
    stepCount: 0,
    createdAt: now,
    updatedAt: now,
  };
}

async function persistFinalStatus(
  store: FlatRuntimeFileStore,
  run: FlatRuntimeRunRecord,
  cycle: FlatRuntimeCycleRecord,
  status: FlatRuntimeStatus,
  unitIds: readonly string[],
  streamIds: readonly string[],
  reason?: string,
): Promise<void> {
  await store.saveRun(updateRun(run, status, unitIds, streamIds, reason));
  await store.saveCycle(updateCycle(cycle, status, unitIds, streamIds, reason));
}

function updateRun(
  record: FlatRuntimeRunRecord,
  status: FlatRuntimeStatus,
  unitIds: readonly string[],
  streamIds: readonly string[],
  reason?: string,
): FlatRuntimeRunRecord {
  return {
    ...record,
    status,
    unitIds,
    streamIds,
    updatedAt: new Date().toISOString(),
    ...(reason ? { reason } : {}),
  };
}

function updateCycle(
  record: FlatRuntimeCycleRecord,
  status: FlatRuntimeStatus,
  unitIds: readonly string[],
  streamIds: readonly string[],
  reason?: string,
): FlatRuntimeCycleRecord {
  return {
    ...record,
    status,
    unitIds,
    streamIds,
    updatedAt: new Date().toISOString(),
    ...(reason ? { reason } : {}),
  };
}

function aggregateStatus(results: readonly FlatRuntimeStreamResult[]): 'succeeded' | 'blocked' | 'failed' {
  if (results.some((streamResult) => streamResult.status === 'failed')) return 'failed';
  if (results.some((streamResult) => streamResult.status === 'blocked')) return 'blocked';
  return 'succeeded';
}

function normalizeMaxSteps(value: number | undefined): number {
  if (value === undefined) return 25;
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError('maxStepsPerStream must be a positive integer');
  }
  return value;
}

function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function result(input: {
  readonly input: FlatRuntimePathwayInput;
  readonly store: FlatRuntimeFileStore;
  readonly runId: string;
  readonly cycleId: string;
  readonly status: 'succeeded' | 'blocked' | 'failed';
  readonly activationResult: FlowResult;
  readonly unitIds?: readonly string[];
  readonly streamResults?: readonly FlatRuntimeStreamResult[];
  readonly reason?: string;
  readonly evidenceArchives?: readonly string[];
}): FlatRuntimePathwayResult {
  return {
    runId: input.runId,
    cycleId: input.cycleId,
    taskRef: input.input.taskRef,
    status: input.status,
    activationResult: input.activationResult,
    unitIds: input.unitIds ?? [],
    streamResults: input.streamResults ?? [],
    runDirectory: input.store.runDirectory(input.runId),
    evidenceArchives: input.evidenceArchives ?? [],
    ...(input.reason ? { reason: input.reason } : {}),
  };
}
