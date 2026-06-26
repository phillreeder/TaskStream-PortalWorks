import assert from 'node:assert/strict';
import test from 'node:test';
import type { PersistentQueueItem, StoredEvent } from '../../task-storage/index.js';
import type { TenantProcessResolution } from '../../../infrastructure/tenant-process/TenantProcessLoader.js';
import type { StreamStatePlanningContract } from '../../../modules/StreamState/index.js';
import { TenantProcessPlanningPipeline } from '../TenantProcessPlanningPipeline.js';

function queueItem(kind: 'activation' | 'stream' = 'stream'): PersistentQueueItem {
  return {
    id: 'queue-1',
    sourceEventId: 'event-1',
    sourceTaskId: 'task-instance-1',
    taskRef: 'secondTask',
    taskName: 'Second task instance',
    tenantProcessId: 'TaskStream/MultiTask',
    eventReactionId: kind === 'activation'
      ? 'reaction.task-created.activate-task'
      : 'reaction.stream-ready.process-channel',
    intentType: kind === 'activation' ? 'planner.activate-task' : 'planner.process-channel',
    handlerKey: kind === 'activation' ? 'task-activation.execute' : 'stream-planning.process-channel',
    status: 'claimed',
    attemptCount: 1,
    availableAt: new Date(0).toISOString(),
    claimedBy: 'worker-1',
    claimedAt: new Date(0).toISOString(),
    completedAt: null,
    failedAt: null,
    lastError: null,
    createdAt: new Date(0).toISOString(),
  };
}

function sourceEvent(kind: 'activation' | 'stream' = 'stream'): StoredEvent {
  return {
    id: 'event-1',
    eventType: kind === 'activation' ? 'task.created' : 'stream.ready',
    sourceEntityType: kind === 'activation' ? 'Task' : 'Stream',
    sourceEntityId: kind === 'activation' ? 'task-instance-1' : 'stream-instance-7',
    entityStructureType: 'Event',
    entityStructureVersion: 1,
    payload: {
      sourceTaskId: 'task-instance-1',
      taskRef: 'secondTask',
      taskName: 'Second task instance',
      tenantProcessId: 'TaskStream/MultiTask',
      ...(kind === 'stream' ? { streamId: 'stream-instance-7' } : {}),
    },
    occurredAt: new Date(0).toISOString(),
  };
}

function planningContract(
  state: Record<string, unknown>,
  options: { readonly streamKey?: string; readonly version?: number } = {},
): StreamStatePlanningContract {
  const streamKey = options.streamKey ?? 'stream-instance-7';
  const version = options.version ?? 4;
  return {
    planningContractId: `planning:${streamKey}:${version}`,
    streamKey,
    resolvedState: {
      streamKey,
      authoritativeVersion: version,
      effectiveVersion: version,
      state: state as StreamStatePlanningContract['resolvedState']['state'],
      appliedPendingChangeIds: [],
      blockedChangeIds: [],
      dependencyBlocks: [],
    },
    readablePaths: [],
    writablePaths: [],
    expectedChanges: [],
    dependencyBlocks: [],
    createdAt: new Date(1000).toISOString(),
  };
}

function fixtureResolution(): TenantProcessResolution {
  const activationFlow = {
    flowId: 'activateTask',
    executable: () => ({ status: 'succeeded' as const }),
  };
  const firstSto = {
    flow: {
      flowId: 'firstFlow',
      executable: () => ({ status: 'succeeded' as const }),
    },
  };
  const secondSto = {
    flow: {
      flowId: 'secondFlow',
      executable: () => ({ status: 'succeeded' as const }),
    },
  };
  const firstChannel = {
    executable: (context: any) => context.selectSto('firstSto', 'first task selected'),
  };
  const secondChannel = {
    executable: (context: any) => context.selectSto('secondSto', 'second task selected'),
  };
  const tenantProcess = {
    id: { tenant: 'TaskStream', process: 'MultiTask' },
    name: 'MultiTask',
    version: 1,
    description: 'Multi-task planning fixture',
    stateDefinitions: {
      first: { defaults: { status: 'pending' } },
      second: { defaults: { status: 'pending' } },
    },
    channels: { firstChannel, secondChannel },
    stos: { firstSto, secondSto },
    tasks: {
      firstTask: {
        activationFlow,
        stateDefinition: { defaults: { status: 'pending' } },
        channel: firstChannel,
        stos: { firstSto },
      },
      secondTask: {
        activationFlow,
        stateDefinition: { defaults: { status: 'pending' } },
        channel: secondChannel,
        stos: { secondSto },
      },
    },
  };

  return {
    tenantProcess: tenantProcess as unknown as TenantProcessResolution['tenantProcess'],
    requestedTenantProcessId: 'TaskStream/MultiTask',
    resolvedTenantProcessId: 'TaskStream/MultiTask',
    loaderKey: 'fixture',
  };
}

test('TenantProcessPlanningPipeline resolves a Stream before Channel planning and never uses Task UUID as StreamState identity', async () => {
  const resolution = fixtureResolution();
  const pipeline = new TenantProcessPlanningPipeline({
    queueItem: queueItem(),
    sourceEvent: sourceEvent(),
    loader: { load: async () => resolution },
    streamStateProvider: {
      load: async ({ streamKey }) => planningContract({ status: 'pending' }, { streamKey }),
    },
  });

  await pipeline.loadTenantProcess();
  pipeline.resolveTask();
  pipeline.resolveStream();
  pipeline.resolveChannel();
  await pipeline.loadStreamState();
  pipeline.createChannelContext();
  pipeline.invokeChannel();
  pipeline.resolveAndValidateSto();
  pipeline.resolveFlow();
  const dispatch = pipeline.createExecutionDispatch({
    correlationId: 'correlation-1',
    tenantProcessId: resolution.resolvedTenantProcessId,
    workType: 'process-channel-result',
  });

  assert.equal(dispatch.executionKind, 'stream-flow');
  if (dispatch.executionKind !== 'stream-flow') assert.fail('Expected Stream Flow dispatch.');
  assert.equal(dispatch.sourceTaskId, 'task-instance-1');
  assert.equal(dispatch.streamId, 'stream-instance-7');
  assert.equal(dispatch.taskRef, 'secondTask');
  assert.equal(dispatch.channelRef, 'secondChannel');
  assert.equal(dispatch.stoRef, 'secondSto');
  assert.equal(dispatch.flowRef, 'secondFlow');
  assert.equal(dispatch.planningEvidence?.streamKey, 'stream-instance-7');
  assert.notEqual(dispatch.planningEvidence?.streamKey, dispatch.sourceTaskId);
});

test('TenantProcessPlanningPipeline selects the STO from authoritative StreamState and carries its evidence', async () => {
  const prepareSto = {
    flow: {
      flowId: 'prepareWork',
      executable: () => ({ status: 'succeeded' as const }),
    },
  };
  const inspectSto = {
    flow: {
      flowId: 'inspectWork',
      executable: () => ({ status: 'succeeded' as const }),
    },
  };
  const activationFlow = {
    flowId: 'activateTask',
    executable: () => ({ status: 'succeeded' as const }),
  };
  const channel = {
    executable: (context: any) => context.state.read('status') === 'pending'
      ? context.selectSto('prepareWork', 'state is pending')
      : context.selectSto('inspectWork', 'state has advanced'),
  };
  const tenantProcess = {
    id: { tenant: 'TaskStream', process: 'StateDriven' },
    name: 'StateDriven',
    version: 1,
    description: 'State-driven planning fixture',
    stateDefinitions: { second: { defaults: { status: 'pending' } } },
    channels: { secondChannel: channel },
    stos: { prepareWork: prepareSto, inspectWork: inspectSto },
    tasks: {
      secondTask: {
        activationFlow,
        stateDefinition: { defaults: { status: 'pending' } },
        channel,
        stos: { prepareWork: prepareSto, inspectWork: inspectSto },
      },
    },
  };
  const resolution: TenantProcessResolution = {
    tenantProcess: tenantProcess as unknown as TenantProcessResolution['tenantProcess'],
    requestedTenantProcessId: 'TaskStream/StateDriven',
    resolvedTenantProcessId: 'TaskStream/StateDriven',
    loaderKey: 'fixture',
  };
  const pipeline = new TenantProcessPlanningPipeline({
    queueItem: { ...queueItem(), tenantProcessId: 'TaskStream/StateDriven' },
    sourceEvent: sourceEvent(),
    loader: { load: async () => resolution },
    streamStateProvider: {
      load: async ({ streamKey }) => planningContract({ status: 'prepared' }, { streamKey, version: 7 }),
    },
  });

  await pipeline.loadTenantProcess();
  pipeline.resolveTask();
  pipeline.resolveStream();
  pipeline.resolveChannel();
  await pipeline.loadStreamState();
  pipeline.createChannelContext();
  pipeline.invokeChannel();
  pipeline.resolveAndValidateSto();
  pipeline.resolveFlow();
  const dispatch = pipeline.createExecutionDispatch({
    correlationId: 'correlation-state',
    tenantProcessId: resolution.resolvedTenantProcessId,
    workType: 'process-channel-result',
  });

  assert.equal(dispatch.executionKind, 'stream-flow');
  if (dispatch.executionKind !== 'stream-flow') assert.fail('Expected Stream Flow dispatch.');
  assert.equal(dispatch.stoRef, 'inspectWork');
  assert.equal(dispatch.reason, 'state has advanced');
  assert.equal(dispatch.planningEvidence?.authoritativeVersion, 7);
  assert.deepEqual(dispatch.planningEvidence?.stateSnapshot, { status: 'prepared' });
  assert.equal(dispatch.planningEvidence?.planningContractId, 'planning:stream-instance-7:7');
});

test('TenantProcessPlanningPipeline dispatches Task.activationFlow before any Stream or Channel exists', async () => {
  const resolution = fixtureResolution();
  let stateLoadCount = 0;
  const pipeline = new TenantProcessPlanningPipeline({
    queueItem: queueItem('activation'),
    sourceEvent: sourceEvent('activation'),
    loader: { load: async () => resolution },
    streamStateProvider: {
      load: async () => {
        stateLoadCount += 1;
        return planningContract({ status: 'pending' });
      },
    },
  });

  await pipeline.loadTenantProcess();
  pipeline.resolveTask();
  pipeline.resolveActivationFlow();
  const dispatch = pipeline.createActivationDispatch({
    correlationId: 'correlation-activation',
    tenantProcessId: resolution.resolvedTenantProcessId,
    workType: 'task-activation',
  });

  assert.equal(stateLoadCount, 0);
  assert.equal(dispatch.executionKind, 'task-activation');
  if (dispatch.executionKind !== 'task-activation') assert.fail('Expected Task activation dispatch.');
  assert.equal(dispatch.taskRef, 'secondTask');
  assert.equal(dispatch.flowRef, 'activateTask');
  assert.equal('channelRef' in dispatch, false);
  assert.equal('stoRef' in dispatch, false);
  assert.equal('streamId' in dispatch, false);
  assert.equal('planningEvidence' in dispatch, false);
  assert.equal(dispatch.flowParams.sourceTaskId, 'task-instance-1');
});
