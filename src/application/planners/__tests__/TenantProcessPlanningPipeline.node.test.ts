import assert from 'node:assert/strict';
import test from 'node:test';
import type { PersistentQueueItem, StoredEvent } from '../../task-storage/index.js';
import type { TenantProcessResolution } from '../../../infrastructure/tenant-process/TenantProcessLoader.js';
import type { StreamStatePlanningContract } from '../../../modules/StreamState/index.js';
import { TenantProcessPlanningPipeline } from '../TenantProcessPlanningPipeline.js';

function queueItem(): PersistentQueueItem {
  return {
    id: 'queue-1',
    sourceEventId: 'event-1',
    sourceTaskId: 'task-instance-1',
    taskRef: 'secondTask',
    taskName: 'Second task instance',
    tenantProcessId: 'TaskStream/MultiTask',
    eventReactionId: 'reaction.task-created.process-channel',
    intentType: 'planner.process-channel',
    handlerKey: 'task-planning.process-channel',
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

const sourceEvent: StoredEvent = {
  id: 'event-1',
  eventType: 'task.created',
  sourceEntityType: 'Task',
  sourceEntityId: 'task-instance-1',
  entityStructureType: 'Event',
  entityStructureVersion: 1,
  payload: {
    sourceTaskId: 'task-instance-1',
    taskRef: 'secondTask',
    taskName: 'Second task instance',
    tenantProcessId: 'TaskStream/MultiTask',
  },
  occurredAt: new Date(0).toISOString(),
};

function planningContract(
  state: Record<string, unknown>,
  options: { readonly streamKey?: string; readonly version?: number } = {},
): StreamStatePlanningContract {
  const streamKey = options.streamKey ?? 'task-instance-1';
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

test('TenantProcessPlanningPipeline resolves the queued Task key instead of assuming one Task', async () => {
  const firstFlow = () => ({ status: 'succeeded' as const });
  const secondFlow = () => ({ status: 'succeeded' as const });
  const firstSto = { flow: firstFlow };
  const secondSto = { flow: secondFlow };
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
        stateDefinition: { defaults: { status: 'pending' } },
        channel: firstChannel,
        stos: { firstSto },
      },
      secondTask: {
        stateDefinition: { defaults: { status: 'pending' } },
        channel: secondChannel,
        stos: { secondSto },
      },
    },
  };

  const resolution: TenantProcessResolution = {
    tenantProcess: tenantProcess as unknown as TenantProcessResolution['tenantProcess'],
    requestedTenantProcessId: 'TaskStream/MultiTask',
    resolvedTenantProcessId: 'TaskStream/MultiTask',
    loaderKey: 'fixture',
  };
  const pipeline = new TenantProcessPlanningPipeline({
    queueItem: queueItem(),
    sourceEvent,
    loader: { load: async () => resolution },
    streamStateProvider: {
      load: async ({ streamKey }) => planningContract({ status: 'pending' }, { streamKey }),
    },
  });

  await pipeline.loadTenantProcess();
  pipeline.resolveTask();
  pipeline.resolveChannel();
  await pipeline.loadStreamState();
  pipeline.createChannelContext();
  pipeline.invokeChannel();
  pipeline.resolveAndValidateSto();
  pipeline.resolveFlow();
  const dispatch = pipeline.createExecutionDispatch({
    correlationId: 'correlation-1',
    tenantProcessId: resolution.resolvedTenantProcessId,
    workType: 'planner.process-channel',
  });

  assert.equal(dispatch.sourceTaskId, 'task-instance-1');
  assert.equal(dispatch.sourceTaskName, 'Second task instance');
  assert.equal(dispatch.taskRef, 'secondTask');
  assert.equal(dispatch.channelRef, 'secondChannel');
  assert.equal(dispatch.stoRef, 'secondSto');
  assert.equal(dispatch.flowRef, 'secondSto');
  assert.equal(dispatch.reason, 'second task selected');
  assert.equal(dispatch.planningEvidence.streamKey, 'task-instance-1');
  assert.equal(dispatch.planningEvidence.effectiveVersion, 4);
  assert.deepEqual(dispatch.planningEvidence.stateSnapshot, { status: 'pending' });
});

test('TenantProcessPlanningPipeline selects the STO from authoritative StreamState and carries its evidence', async () => {
  const prepareSto = { flow: () => ({ status: 'succeeded' as const }) };
  const inspectSto = { flow: () => ({ status: 'succeeded' as const }) };
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
  let seededDefaults: Record<string, unknown> | undefined;
  const pipeline = new TenantProcessPlanningPipeline({
    queueItem: { ...queueItem(), tenantProcessId: 'TaskStream/StateDriven' },
    sourceEvent,
    loader: { load: async () => resolution },
    streamStateProvider: {
      load: async ({ streamKey, initialState }) => {
        seededDefaults = initialState;
        return planningContract({ status: 'prepared' }, { streamKey, version: 7 });
      },
    },
  });

  await pipeline.loadTenantProcess();
  pipeline.resolveTask();
  pipeline.resolveChannel();
  await pipeline.loadStreamState();
  pipeline.createChannelContext();
  pipeline.invokeChannel();
  pipeline.resolveAndValidateSto();
  pipeline.resolveFlow();
  const dispatch = pipeline.createExecutionDispatch({
    correlationId: 'correlation-state',
    tenantProcessId: resolution.resolvedTenantProcessId,
    workType: 'planner.process-channel',
  });

  assert.deepEqual(seededDefaults, { status: 'pending' });
  assert.equal(dispatch.stoRef, 'inspectWork');
  assert.equal(dispatch.reason, 'state has advanced');
  assert.equal(dispatch.planningEvidence.authoritativeVersion, 7);
  assert.equal(dispatch.planningEvidence.effectiveVersion, 7);
  assert.deepEqual(dispatch.planningEvidence.stateSnapshot, { status: 'prepared' });
  assert.equal(dispatch.planningEvidence.planningContractId, 'planning:task-instance-1:7');
});
