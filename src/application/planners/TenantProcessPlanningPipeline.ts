import { randomUUID } from 'node:crypto';
import type {
  ChannelContext,
  ChannelSTOSelection,
  ChannelStateReader,
  ComposedTenantProcessChannel,
  ComposedTenantProcessDefinition,
  ComposedTenantProcessFlow,
  ComposedTenantProcessSto,
  ComposedTenantProcessTask,
} from '../../domain/tenantProcess/index.js';
import type {
  TenantProcessLoaderInput,
  TenantProcessResolution,
} from '../../infrastructure/tenant-process/TenantProcessLoader.js';
import type {
  PersistentQueueItem,
  StoredEvent,
} from '../task-storage/index.js';
import type { StreamStatePlanningContract } from '../../modules/StreamState/index.js';
import type { StreamStatePlanningEvidence } from '../execution/types.js';
import type { PlannerExecutionDispatch } from './ExecutionWorkPublisher.js';

export interface TenantProcessPlanningLoader {
  load(input: TenantProcessLoaderInput): Promise<TenantProcessResolution>;
}

export interface TenantProcessPlanningStreamStateProvider {
  load(input: {
    readonly streamKey: string;
  }): Promise<StreamStatePlanningContract>;
}

export interface TenantProcessPlanningPipelineInput {
  readonly queueItem: PersistentQueueItem;
  readonly sourceEvent: StoredEvent;
  readonly loader: TenantProcessPlanningLoader;
  readonly streamStateProvider: TenantProcessPlanningStreamStateProvider;
}

export interface CreateExecutionDispatchInput {
  readonly correlationId: string;
  readonly tenantProcessId: string;
  readonly workType: string;
}

/**
 * Mutable, single-use planning workspace for one claimed queue item.
 *
 * Task activation and Stream planning deliberately share TenantProcess and
 * Flow dispatch mechanics, but only Stream planning may enter a Channel or
 * read StreamState.
 */
export class TenantProcessPlanningPipeline {
  private resolution?: TenantProcessResolution;
  private tenantProcess?: ComposedTenantProcessDefinition;
  private task?: ComposedTenantProcessTask;
  private activationFlow?: ComposedTenantProcessFlow;
  private channel?: ComposedTenantProcessChannel;
  private streamId?: string;
  private streamState?: ChannelStateReader;
  private streamStatePlanningContract?: StreamStatePlanningContract;
  private channelContext?: ChannelContext;
  private channelSelection?: ChannelSTOSelection;
  private sto?: ComposedTenantProcessSto;
  private flow?: ComposedTenantProcessFlow;
  private channelRef?: string;
  private stoRef?: string;
  private flowRef?: string;

  public constructor(private readonly input: TenantProcessPlanningPipelineInput) {}

  public async loadTenantProcess(): Promise<TenantProcessResolution> {
    this.resolution = await this.input.loader.load({
      tenantProcessId: this.input.queueItem.tenantProcessId,
    });
    this.tenantProcess = this.resolution.tenantProcess;
    return this.resolution;
  }

  public resolveTask(): void {
    const tenantProcess = this.require(this.tenantProcess, 'TenantProcess must be loaded before resolving its Task.');
    const task = tenantProcess.tasks[this.input.queueItem.taskRef];
    if (!task) {
      throw new Error(
        `Task ${this.input.queueItem.taskRef} was not found in TenantProcess ${tenantProcess.name}.`,
      );
    }
    this.task = task;
  }

  public resolveActivationFlow(): void {
    const task = this.require(this.task, 'Task must be resolved before resolving its activation Flow.');
    if (!task.activationFlow || typeof task.activationFlow.executable !== 'function') {
      throw new Error(`Task ${this.input.queueItem.taskRef} does not declare a valid activationFlow.`);
    }
    this.activationFlow = task.activationFlow;
    this.flowRef = task.activationFlow.flowId;
  }

  public resolveStream(): void {
    const streamId = this.input.sourceEvent.payload.streamId;
    if (typeof streamId !== 'string' || !streamId.trim()) {
      throw new Error(`Stream planning event ${this.input.sourceEvent.id} is missing streamId.`);
    }
    this.streamId = streamId;
  }

  public resolveChannel(): void {
    const tenantProcess = this.require(this.tenantProcess, 'TenantProcess must be loaded before resolving its Channel.');
    const task = this.require(this.task, 'Task must be resolved before resolving its Channel.');
    if (!task.channel) {
      throw new Error(`Task ${this.input.queueItem.taskRef} does not declare a Channel for planning.`);
    }

    const channelEntry = Object.entries(tenantProcess.channels).find(([, channel]) => channel === task.channel);
    if (!channelEntry) {
      throw new Error(
        `Task ${this.input.queueItem.taskRef} references a Channel outside the TenantProcess channel collection.`,
      );
    }

    [this.channelRef, this.channel] = channelEntry;
  }

  public async loadStreamState(): Promise<void> {
    this.require(this.task, 'Task must be resolved before loading StreamState.');
    const streamId = this.require(this.streamId, 'Stream must be resolved before loading StreamState.');

    this.streamStatePlanningContract = await this.input.streamStateProvider.load({
      streamKey: streamId,
    });

    const snapshot = this.cloneSnapshot(this.streamStatePlanningContract.resolvedState.state);
    this.streamState = {
      read: (path: string) => this.readSnapshotPath(snapshot, path),
      snapshot: () => this.cloneSnapshot(snapshot),
    };
  }

  public createChannelContext(): void {
    const streamState = this.require(this.streamState, 'StreamState must be loaded before creating Channel context.');

    this.channelContext = {
      taskRef: this.input.queueItem.taskRef,
      state: streamState,
      params: {
        streamId: this.require(this.streamId, 'Stream is unavailable for Channel context.'),
        sourceTaskId: this.input.queueItem.sourceTaskId,
        sourceTaskName: this.input.queueItem.taskName,
        sourceEventId: this.input.sourceEvent.id,
        sourceQueueItemId: this.input.queueItem.id,
      },
      selectSto: (stoName: string, reason: string) => ({ type: 'sto', stoName, reason }),
    };
  }

  public invokeChannel(): void {
    const channel = this.require(this.channel, 'Channel must be resolved before invocation.');
    const context = this.require(this.channelContext, 'Channel context must be created before invocation.');
    this.channelSelection = channel.executable(context);
  }

  public resolveAndValidateSto(): void {
    const tenantProcess = this.require(this.tenantProcess, 'TenantProcess must be loaded before resolving an STO.');
    const task = this.require(this.task, 'Task must be resolved before resolving an STO.');
    const selection = this.require(this.channelSelection, 'Channel must be invoked before resolving an STO.');

    const selectedEntry = Object.entries(task.stos).find(([stoName]) => stoName === selection.stoName);
    if (!selectedEntry) {
      throw new Error(
        `Channel ${this.require(this.channelRef, 'Channel reference is unavailable.')} selected STO name ${selection.stoName} outside Task ${this.input.queueItem.taskRef}.`,
      );
    }

    const [stoRef, sto] = selectedEntry;
    if (tenantProcess.stos[stoRef] !== sto) {
      throw new Error(
        `Task ${this.input.queueItem.taskRef} STO ${stoRef} is not the registered TenantProcess STO object.`,
      );
    }

    this.stoRef = stoRef;
    this.sto = sto;
  }

  public resolveFlow(): void {
    this.require(this.tenantProcess, 'TenantProcess must be loaded before resolving a Flow.');
    const sto = this.require(this.sto, 'STO must be resolved before resolving its Flow.');

    this.flow = sto.flow;
    this.flowRef = sto.flow.flowId;

    if (typeof this.flow.executable !== 'function') {
      throw new Error(`Selected STO ${this.require(this.stoRef, 'STO reference is unavailable.')} does not contain an executable Flow.`);
    }
  }

  public createActivationDispatch(input: CreateExecutionDispatchInput): PlannerExecutionDispatch {
    this.require(this.activationFlow, 'Task activation Flow is unavailable.');

    return {
      executionKind: 'task-activation',
      correlationId: input.correlationId,
      sourceTaskId: this.input.queueItem.sourceTaskId,
      sourceTaskName: this.input.queueItem.taskName,
      sourceEventId: this.input.sourceEvent.id,
      sourceQueueItemId: this.input.queueItem.id,
      tenantProcessId: input.tenantProcessId,
      taskRef: this.input.queueItem.taskRef,
      flowRef: this.require(this.flowRef, 'Activation Flow reference is unavailable.'),
      executionId: randomUUID(),
      requestId: randomUUID(),
      workType: input.workType,
      reason: 'Task activation Flow determines and creates initial Units before Stream Channel planning.',
      flowParams: {
        sourceTaskId: this.input.queueItem.sourceTaskId,
        sourceTaskName: this.input.queueItem.taskName,
        sourceEventId: this.input.sourceEvent.id,
        sourceQueueItemId: this.input.queueItem.id,
      },
    };
  }

  public createExecutionDispatch(input: CreateExecutionDispatchInput): PlannerExecutionDispatch {
    const selection = this.require(this.channelSelection, 'Channel selection is unavailable.');

    return {
      executionKind: 'stream-flow',
      correlationId: input.correlationId,
      sourceTaskId: this.input.queueItem.sourceTaskId,
      sourceTaskName: this.input.queueItem.taskName,
      sourceEventId: this.input.sourceEvent.id,
      sourceQueueItemId: this.input.queueItem.id,
      tenantProcessId: input.tenantProcessId,
      channelRef: this.require(this.channelRef, 'Channel reference is unavailable.'),
      taskRef: this.input.queueItem.taskRef,
      stoRef: this.require(this.stoRef, 'STO reference is unavailable.'),
      flowRef: this.require(this.flowRef, 'Flow reference is unavailable.'),
      executionId: randomUUID(),
      requestId: randomUUID(),
      workType: input.workType,
      streamId: this.require(this.streamId, 'Stream is unavailable for execution dispatch.'),
      planningEvidence: this.createPlanningEvidence(),
      reason: selection.reason,
    };
  }

  private createPlanningEvidence(): StreamStatePlanningEvidence {
    const contract = this.require(
      this.streamStatePlanningContract,
      'StreamState planning contract is unavailable.',
    );

    return {
      streamKey: contract.streamKey,
      planningContractId: contract.planningContractId,
      authoritativeVersion: contract.resolvedState.authoritativeVersion,
      effectiveVersion: contract.resolvedState.effectiveVersion,
      stateSnapshot: this.cloneSnapshot(contract.resolvedState.state),
      readablePaths: contract.readablePaths,
      writablePaths: contract.writablePaths,
      expectedChanges: contract.expectedChanges,
      dependencyBlocks: contract.dependencyBlocks,
      capturedAt: contract.createdAt,
    };
  }

  private readSnapshotPath(snapshot: Record<string, unknown>, path: string): unknown {
    if (Object.prototype.hasOwnProperty.call(snapshot, path)) {
      return snapshot[path];
    }

    const segments = path.split('.').filter(Boolean);
    let cursor: unknown = snapshot;
    for (const segment of segments) {
      if (typeof cursor !== 'object' || cursor === null || Array.isArray(cursor)) {
        return undefined;
      }
      cursor = (cursor as Record<string, unknown>)[segment];
    }
    return cursor;
  }

  private cloneSnapshot<T extends Record<string, unknown>>(snapshot: T): T {
    return JSON.parse(JSON.stringify(snapshot)) as T;
  }

  private require<T>(value: T | undefined, message: string): T {
    if (value === undefined) throw new Error(message);
    return value;
  }
}
