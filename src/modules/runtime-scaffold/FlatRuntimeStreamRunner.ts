import { StateContainer } from '../../definitionRuntime/state/index.js';
import type {
  ComposedTenantProcessDefinition,
  ComposedTenantProcessSto,
  ComposedTenantProcessTask,
  FlowResult,
} from '../../domain/tenantProcess/index.js';
import {
  type FlatRuntimeAccessors,
  type FlatRuntimeSession,
  type FlatRuntimeTraceWriter,
} from './FlatRuntimeAccessors.js';
import { FlatRuntimeFileStore, type FlatRuntimeStreamRecord } from './FlatRuntimeStore.js';
import { createScaffoldFlowContextForExecution } from './ScaffoldFlowContext.js';

export interface FlatRuntimeStreamResult {
  readonly streamId: string;
  readonly unitId: string;
  readonly status: 'succeeded' | 'blocked' | 'failed';
  readonly stepCount: number;
  readonly finalState: Record<string, unknown>;
  readonly reason?: string;
}

export async function runFlatRuntimeStream(input: {
  readonly tenantProcess: ComposedTenantProcessDefinition;
  readonly task: ComposedTenantProcessTask;
  readonly stream: FlatRuntimeStreamRecord;
  readonly initialState: Record<string, unknown>;
  readonly maxSteps: number;
  readonly store: FlatRuntimeFileStore;
  readonly session: FlatRuntimeSession;
  readonly accessors: FlatRuntimeAccessors;
  readonly trace: FlatRuntimeTraceWriter;
}): Promise<FlatRuntimeStreamResult> {
  let state = cloneRecord(input.initialState);
  let stream = input.stream;
  input.session.currentStreamId = stream.streamId;

  for (let step = 1; step <= input.maxSteps; step += 1) {
    const selection = input.task.channel!.executable({
      taskRef: input.session.taskRef,
      state: {
        read: (path) => readPath(state, path),
        snapshot: () => cloneRecord(state),
      },
      params: {
        runId: input.session.runId,
        cycleId: input.session.cycleId,
        streamId: stream.streamId,
        unitId: stream.unitId,
        ...input.session.input,
      },
      selectSto: (stoName, reason) => ({ type: 'sto', stoName, reason }),
    });
    const [stoRef, sto] = resolveSto(input.tenantProcess, input.task, selection.stoName);
    const flowRef = sto.flow.flowId;
    const container = new StateContainer({
      definition: input.task.stateDefinition,
      state: state as any,
    });

    stream = {
      ...stream,
      status: 'running',
      stepCount: step,
      lastStoRef: stoRef,
      lastFlowRef: flowRef,
      updatedAt: new Date().toISOString(),
    };
    await input.store.saveStream(stream);
    await input.trace('stream', 'flow-started', {
      streamId: stream.streamId,
      unitId: stream.unitId,
      stoRef,
      flowRef,
      step,
      reason: selection.reason,
    });

    let flowResult: FlowResult;
    try {
      flowResult = await sto.flow.executable(
        createScaffoldFlowContextForExecution({
          taskRef: input.session.taskRef,
          binding: { kind: 'stream-flow', stoRef, flowRef },
          container,
          accessors: input.accessors,
        }),
        {
          runId: input.session.runId,
          cycleId: input.session.cycleId,
          streamId: stream.streamId,
          unitId: stream.unitId,
          ...input.session.input,
        } as Record<string, any>,
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return finishFlatRuntimeStream(input, stream, state, 'failed', reason);
    }

    const proposedState = cloneRecord(container.snapshot());
    await input.store.saveStreamState(input.session.runId, stream.streamId, proposedState);
    await input.trace('stream', 'flow-completed', {
      streamId: stream.streamId,
      unitId: stream.unitId,
      stoRef,
      flowRef,
      step,
      status: flowResult.status,
      result: flowResult.result,
      metadata: flowResult.metadata,
    });

    if (flowResult.status === 'failed') {
      return finishFlatRuntimeStream(
        input,
        stream,
        proposedState,
        'failed',
        flowResult.reason ?? `Flow ${flowRef} failed`,
      );
    }
    if (flowResult.status === 'retry') {
      return finishFlatRuntimeStream(
        input,
        stream,
        proposedState,
        'blocked',
        flowResult.reason ?? `Flow ${flowRef} requested retry`,
      );
    }

    const changed = !sameJson(state, proposedState);
    state = proposedState;
    if (!changed) {
      return finishFlatRuntimeStream(input, stream, state, 'succeeded');
    }
  }

  return finishFlatRuntimeStream(
    input,
    stream,
    state,
    'failed',
    `Flat RuntimeScaffold exceeded ${input.maxSteps} steps for Stream ${stream.streamId}`,
  );
}

async function finishFlatRuntimeStream(
  input: {
    readonly store: FlatRuntimeFileStore;
    readonly session: FlatRuntimeSession;
    readonly trace: FlatRuntimeTraceWriter;
  },
  stream: FlatRuntimeStreamRecord,
  state: Record<string, unknown>,
  status: 'succeeded' | 'blocked' | 'failed',
  reason?: string,
): Promise<FlatRuntimeStreamResult> {
  const next: FlatRuntimeStreamRecord = {
    ...stream,
    status,
    ...(reason ? { reason } : {}),
    updatedAt: new Date().toISOString(),
  };
  await input.store.saveStream(next);
  await input.store.saveStreamState(input.session.runId, stream.streamId, state);
  await input.trace('stream', 'completed', {
    streamId: stream.streamId,
    unitId: stream.unitId,
    status,
    reason,
    stepCount: stream.stepCount,
  });
  return {
    streamId: stream.streamId,
    unitId: stream.unitId,
    status,
    stepCount: stream.stepCount,
    finalState: cloneRecord(state),
    ...(reason ? { reason } : {}),
  };
}

function resolveSto(
  tenantProcess: ComposedTenantProcessDefinition,
  task: ComposedTenantProcessTask,
  stoRef: string,
): readonly [string, ComposedTenantProcessSto] {
  const sto = task.stos[stoRef];
  if (!sto) {
    throw new Error(`Task Channel selected STO outside its Task: ${stoRef}`);
  }
  if (tenantProcess.stos[stoRef] !== sto) {
    throw new Error(`Task STO ${stoRef} is not the registered TenantProcess STO object`);
  }
  if (!sto.flow || typeof sto.flow.executable !== 'function') {
    throw new Error(`Task STO ${stoRef} does not expose an executable Flow`);
  }
  return [stoRef, sto] as const;
}

function readPath(state: Record<string, unknown>, path: string): unknown {
  if (Object.prototype.hasOwnProperty.call(state, path)) return state[path];
  let cursor: unknown = state;
  for (const segment of path.split('.').filter(Boolean)) {
    if (typeof cursor !== 'object' || cursor === null || Array.isArray(cursor)) return undefined;
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor;
}

function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
