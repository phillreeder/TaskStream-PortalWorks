import { randomUUID } from 'node:crypto';
import type {
  ChannelContext,
  ChannelSTOSelection,
  ChannelStateReader,
  ComposedTenantProcessChannel,
  ComposedTenantProcessDefinition,
  ComposedTenantProcessSto,
  ComposedTenantProcessTask,
  FlowExecutable,
} from '../../domain/tenantProcess/index.js';
import type {
  TenantProcessLoaderInput,
  TenantProcessResolution,
} from '../../infrastructure/tenant-process/TenantProcessLoader.js';
import type {
  PersistentQueueItem,
  StoredEvent,
} from '../task-storage/index.js';
import type { PlannerExecutionDispatch } from './ExecutionWorkPublisher.js';

export interface TenantProcessPlanningLoader {
  load(input: TenantProcessLoaderInput): Promise<TenantProcessResolution>;
}

export interface TenantProcessPlanningPipelineInput {
  readonly queueItem: PersistentQueueItem;
  readonly sourceEvent: StoredEvent;
  readonly loader: TenantProcessPlanningLoader;
}

export interface CreateExecutionDispatchInput {
  readonly correlationId: string;
  readonly tenantProcessId: string;
  readonly workType: string;
}

/**
 * Mutable, single-use planning workspace for one claimed queue item.
 *
 * A new instance must be created for every queue item. The staged methods are
 * intentionally explicit so additional planning boundaries can be inserted
 * without turning the sequence into one opaque operation.
 */
export class TenantProcessPlanningPipeline {
  private resolution?: TenantProcessResolution;
  private tenantProcess?: ComposedTenantProcessDefinition;
  private task?: ComposedTenantProcessTask;
  private channel?: ComposedTenantProcessChannel;
  private streamState?: ChannelStateReader;
  private channelContext?: ChannelContext;
  private channelSelection?: ChannelSTOSelection;
  private sto?: ComposedTenantProcessSto;
  private flow?: FlowExecutable;
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
    const task = this.require(this.task, 'Task must be resolved before loading StreamState.');

    // TODO: Replace StateDefinition defaults with the latest authoritative
    // StreamState loaded through the owning StreamState service boundary.
    const defaults = task.stateDefinition.defaults;
    if (!defaults) {
      throw new Error(
        `Task ${this.input.queueItem.taskRef} references a StateDefinition without defaults for the temporary POC fallback.`,
      );
    }

    this.streamState = {
      read: (path: string) => defaults[path],
      snapshot: () => ({ ...defaults }),
    };
  }

  public createChannelContext(): void {
    const streamState = this.require(this.streamState, 'StreamState must be loaded before creating Channel context.');

    this.channelContext = {
      taskRef: this.input.queueItem.taskRef,
      state: streamState,
      params: {
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

    // TenantProcess composition currently embeds the executable Flow directly
    // on the STO and does not yet retain a separate Flow registry key. Preserve
    // the selected STO reference as the transitional Flow identity until that
    // definition boundary carries an explicit Flow reference.
    this.flowRef = this.require(this.stoRef, 'STO reference is unavailable.');
    this.flow = sto.flow;

    if (typeof this.flow !== 'function') {
      throw new Error(`Selected STO ${this.require(this.stoRef, 'STO reference is unavailable.')} does not contain an executable Flow.`);
    }
  }

  public createExecutionDispatch(input: CreateExecutionDispatchInput): PlannerExecutionDispatch {
    const selection = this.require(this.channelSelection, 'Channel selection is unavailable.');

    return {
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
      reason: selection.reason,
    };
  }

  private require<T>(value: T | undefined, message: string): T {
    if (value === undefined) throw new Error(message);
    return value;
  }
}
