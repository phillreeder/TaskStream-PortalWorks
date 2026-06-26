import type {
  Constraint,
  FieldDefinitions,
  StateContainerOptions,
  StateContainerValidationResult,
  StateDefinition,
  StateDefinitionInput,
  StatePathInput,
  StatePathValueInput,
} from '../../definitionRuntime/state/index.js';
import type {
  FlowArtifactAccessor,
  FlowCredentialsAccessor,
  FlowHttpAccessor,
  FlowLoggerAccessor,
  FlowUnitAccessor,
} from './accessors/index.js';

export type JsonPrimitive = string | number | boolean | null;
export type JsonObject = { readonly [key: string]: JsonValue };
export type JsonArray = readonly JsonValue[];
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;

export type TenantId = string;
export type TenantRef = TenantId;
export type TenantProcessId = string;
export type TenantProcessRef = TenantProcessId;
export type ProcessId = string;
export type TenantProcessVersion = number;
export type TaskRef = string;
export type ChannelRef = string;
export type ProcessChannelRef = string;
export type STORef = string;
export type FlowRef = string;
export type StateDefinitionRef = string;
export type ValidatorRef = string;
export type MapperRef = string;
export type UnitSelectorRef = string;
export type InputContractRef = string;
export type ArtifactContractRef = string;
export type ResultContractRef = string;
export type CredentialContractRef = string;
export type ProcessStateRef = string;
export type ProcessUnitStateRef = string;

export type StatePath = string;
export type StateSnapshot = Record<string, unknown>;
export type StateDefinitionContract<TFields extends FieldDefinitions = FieldDefinitions> =
  | StateDefinitionInput<TFields>
  | StateDefinition<TFields>;

export type ValidationTarget =
  | 'taskInput'
  | 'clientDocument'
  | 'clientFormInput'
  | 'mappedInput'
  | 'flowInput'
  | 'flowResult'
  | 'stoStartState'
  | 'stoEndState'
  | 'artifact'
  | 'result';

export type InputKind = 'form' | 'document' | 'file' | 'json' | 'streamUnit' | 'flowUnit';
export type ArtifactKind = 'file' | 'directory' | 'json' | 'image' | 'html' | 'report';
export type CredentialKind = 'apiKey' | 'oauth' | 'basicAuth' | 'signedUrl' | 'storageAccess' | 'databaseAccess';
export type MapperOutputKind = 'normalizedInput' | 'streamUnit' | 'flowUnit' | 'stateFragment' | 'result' | 'artifact';

export interface TenantProcessDefinition<TFields extends FieldDefinitions = FieldDefinitions> {
  readonly tenantProcessId: TenantProcessId;
  readonly tenantId: TenantId;
  readonly processId: ProcessId;
  readonly version: TenantProcessVersion;

  readonly name: string;
  readonly description: string;

  readonly tasks: Registry<TaskRef, Task>;
  readonly channels: Registry<ChannelRef, Channel>;
  readonly stos: Registry<STORef, STO>;
  readonly flows: Registry<FlowRef, Flow>;
  readonly stateDefinitions: Registry<StateDefinitionRef, StateDefinitionContract<TFields>>;
  readonly validators: Registry<ValidatorRef, Validator>;
  readonly mappers: Registry<MapperRef, Mapper>;

  readonly processChannels?: Registry<ProcessChannelRef, ProcessChannel>;
  readonly unitSelectors?: Registry<UnitSelectorRef, UnitSelector>;
  readonly inputContracts?: Registry<InputContractRef, InputContract>;
  readonly artifactContracts?: Registry<ArtifactContractRef, ArtifactContract>;
  readonly resultContracts?: Registry<ResultContractRef, ResultContract>;
  readonly credentialContracts?: Registry<CredentialContractRef, CredentialContract>;
}

export type Registry<TKey extends string, TValue> = Readonly<Record<TKey, TValue>>;

export interface Task {
  readonly taskId: TaskRef;
  readonly stateDefinitionRef: StateDefinitionRef;
  readonly channelRef?: ChannelRef;
  readonly stoRefs: readonly STORef[];
  readonly defaultStoRef?: STORef;
  readonly inputContractRefs?: readonly InputContractRef[];
  readonly validatorRefs?: readonly ValidatorRef[];
  readonly mapperRefs?: readonly MapperRef[];
  readonly unitSelectorRefs?: readonly UnitSelectorRef[];
}

export interface Channel<TState extends StateSnapshot = StateSnapshot> {
  readonly channelId: ChannelRef;
  readonly executable: ChannelExecutable<TState>;
}

export type ChannelExecutable<TState extends StateSnapshot = StateSnapshot> = (
  context: ChannelContext<TState>,
) => ChannelSTOSelection;

export interface ChannelContext<TState extends StateSnapshot = StateSnapshot> {
  readonly taskRef: TaskRef;
  readonly state: ChannelStateReader<TState>;
  readonly params?: Record<string, unknown>;
  readonly selectSto: (stoName: string, reason: string) => ChannelSTOSelection;
}

export interface ChannelStateReader<TState extends StateSnapshot = StateSnapshot> {
  read(path: string): unknown;
  snapshot?(): TState;
}

export interface ChannelSTOSelection {
  readonly type: 'sto';
  readonly stoName: string;
  readonly reason: string;
}


export interface STO {
  readonly stoName: string;
  readonly stoId: STORef;
  readonly taskRef: TaskRef;
  readonly flowRef: FlowRef;
  readonly startStateConstraints?: readonly Constraint[];
  readonly endStateConstraints?: readonly Constraint[];
  readonly inputContractRefs?: readonly InputContractRef[];
  readonly validatorRefs?: readonly ValidatorRef[];
  readonly mapperRefs?: readonly MapperRef[];
  readonly artifactContractRefs?: readonly ArtifactContractRef[];
  readonly resultContractRefs?: readonly ResultContractRef[];
  readonly credentialContractRefs?: readonly CredentialContractRef[];
}

export interface Flow<TState extends StateSnapshot = StateSnapshot> {
  readonly flowId: FlowRef;
  readonly executable: FlowExecutable<TState>;
}

/**
 * Temporary broad input surface until registered InputContracts provide
 * per-Flow inference. TenantProcess source should consume this through
 * flow((ctx, input) => ...), not import or annotate it directly.
 */
export type FlowInput = Record<string, any>;

export interface FlowStateReader<TState extends StateSnapshot = StateSnapshot> {
  get(input: StatePathInput): any;
  snapshot?(): TState;
}

export interface FlowChangeWriter {
  set(
    input: StatePathValueInput,
    options: StateContainerOptions & { readonly validateOnly: true },
  ): StateContainerValidationResult;
  set(input: StatePathValueInput, options?: StateContainerOptions): void;
}

export type FlowExecutable<
  TState extends StateSnapshot = StateSnapshot,
  TInput extends FlowInput = FlowInput,
  TResult extends FlowResult = FlowResult,
> = (
  context: FlowContext<TState>,
  input: TInput,
) => Promise<TResult> | TResult;

export type FlowProbeEvaluator = () => boolean;

export interface FlowResultOptions {
  readonly artifacts?: readonly unknown[];
  readonly proposedState?: unknown;
  readonly metadata?: Record<string, unknown>;
}

export interface FlowFailureOptions {
  readonly reason?: string;
}

export type FlowRetryOptions =
  | {
      readonly reason?: string;
      readonly afterSeconds?: number;
      readonly allowFastRetry?: false;
    }
  | {
      readonly reason?: string;
      readonly afterSeconds: number;
      readonly allowFastRetry: true;
    };

export type FlowExecutionBinding =
  | {
      readonly kind: 'task-activation';
      readonly flowRef: FlowRef;
    }
  | {
      readonly kind: 'stream-flow';
      readonly flowRef: FlowRef;
      readonly stoRef: STORef;
    };

export interface FlowContext<TState extends StateSnapshot = StateSnapshot> {
  readonly taskRef: TaskRef;
  /** Present only when the Flow was selected through an STO. */
  readonly stoRef?: STORef;
  /** Explicit execution binding for runtimes that distinguish activation from Stream Flow execution. */
  readonly execution?: FlowExecutionBinding;
  readonly state: FlowStateReader<TState>;
  readonly change: FlowChangeWriter;
  readonly artifact: FlowArtifactAccessor;
  readonly credentials: FlowCredentialsAccessor;
  readonly logger: FlowLoggerAccessor;
  readonly unit: FlowUnitAccessor;
  readonly http: FlowHttpAccessor;
  probe(name: string, evaluate: FlowProbeEvaluator): boolean;
  success<TResult = unknown>(result?: TResult, options?: FlowResultOptions): FlowResult;
  retry(options?: FlowRetryOptions): FlowResult;
  fail(options?: FlowFailureOptions): FlowResult;
}

export interface FlowResult {
  readonly status: 'succeeded' | 'retry' | 'failed';
  readonly result?: unknown;
  readonly reason?: string;
  readonly afterSeconds?: number;
  readonly allowFastRetry?: boolean;
  readonly artifacts?: readonly unknown[];
  readonly proposedState?: unknown;
  readonly metadata?: Record<string, unknown>;
}

export type FlowExecutionContext<TState extends StateSnapshot = StateSnapshot> = FlowContext<TState>;
export type FlowExecutionResult = FlowResult;

export interface Validator {
  readonly validatorId: ValidatorRef;
  readonly target: ValidationTarget;
  readonly constraints: readonly Constraint[];
  readonly executable?: ValidatorExecutable;
}

export type ValidatorExecutable = (input: unknown, ctx?: unknown) => ValidationResult;

export interface ValidationResult {
  readonly ok: boolean;
  readonly errors?: readonly ValidationError[];
  readonly metadata?: Record<string, unknown>;
}

export interface ValidationError {
  readonly path?: string;
  readonly code: string;
  readonly message: string;
}

export interface Mapper {
  readonly mapperId: MapperRef;
  readonly sourceContractRef?: InputContractRef | ResultContractRef | ArtifactContractRef;
  readonly targetContractRef?: InputContractRef | ResultContractRef | ArtifactContractRef;
  readonly produces?: MapperOutputKind;
  readonly rules?: readonly MappingRuleDefinition[];
  readonly executable?: MapperExecutable;
}

export interface MappingRuleDefinition {
  readonly from: string;
  readonly to: string;
  readonly transform?: string;
}

export type MapperExecutable = (input: unknown, ctx?: unknown) => unknown;

export interface UnitSelector {
  readonly unitSelectorId: UnitSelectorRef;
  readonly sourceRef?: string;
  readonly filters?: readonly Constraint[];
  readonly mapperRefs?: readonly MapperRef[];
}

export interface StreamStateContract<TFields extends FieldDefinitions = FieldDefinitions> {
  readonly fields: TFields;
}

export interface InputContract<TFields extends FieldDefinitions = FieldDefinitions>
  extends StreamStateContract<TFields> {
  readonly inputContractId?: InputContractRef;
  readonly validatorRefs?: readonly ValidatorRef[];
  readonly mapperRefs?: readonly MapperRef[];
  readonly credentialContractRefs?: readonly CredentialContractRef[];
}

export interface ArtifactContract {
  readonly artifactContractId: ArtifactContractRef;
  readonly artifactKind: ArtifactKind;
  readonly schemaRef?: string;
  readonly validatorRefs?: readonly ValidatorRef[];
  readonly credentialContractRefs?: readonly CredentialContractRef[];
  readonly required?: boolean;
}

export interface ResultContract<TFields extends FieldDefinitions = FieldDefinitions>
  extends StreamStateContract<TFields> {
  readonly resultContractId?: ResultContractRef;
  readonly validatorRefs?: readonly ValidatorRef[];
  readonly mapperRefs?: readonly MapperRef[];
}

export interface CredentialContract {
  readonly credentialContractId: CredentialContractRef;
  readonly credentialKind: CredentialKind;
  readonly scopeRefs?: readonly string[];
  readonly required: boolean;
}

export interface ProcessChannel<TProcessState = EffectiveProcessState> {
  readonly processChannelId: ProcessChannelRef;
  readonly executable: ProcessChannelExecutable<TProcessState>;
  readonly sourceTaskRefs?: readonly TaskRef[];
  readonly targetTaskRefs: readonly TaskRef[];
}

export type ProcessChannelExecutable<TProcessState = EffectiveProcessState> = (
  context: ProcessChannelContext<TProcessState>,
  input?: unknown,
) => ProcessTaskRequest | null;

export interface ProcessChannelContext<TProcessState = EffectiveProcessState> {
  readonly processState: TProcessState;
  readonly sourceTaskRef?: TaskRef;
  readonly params?: Record<string, unknown>;
}

export interface ProcessTaskRequest {
  readonly requestId: string;
  readonly processStateRef: ProcessStateRef;
  readonly processChannelRef: ProcessChannelRef;
  readonly sourceTaskRef?: TaskRef;
  readonly selectedTaskRef: TaskRef;
  readonly selectedUnitStateRefs: readonly ProcessUnitStateRef[];
  readonly taskParams?: Record<string, unknown>;
  readonly reason?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface EffectiveProcessState {
  readonly persisted?: unknown;
  readonly unitStates?: readonly unknown[];
  readonly unitEdges?: readonly unknown[];
  readonly pendingQueueItems?: readonly unknown[];
}

export interface RegisteredTenantProcess<TFields extends FieldDefinitions = FieldDefinitions> {
  readonly definition: TenantProcessDefinition<TFields>;
}

/**
 * Deprecated compatibility surface for earlier runtime-binding experiments.
 * Canonical TenantProcess definitions now own executable Channel and Flow bodies directly.
 */
export type TenantProcessRuntimeBinding = Record<string, never>;

export interface TenantProcessSelectorContext<TSto = STO> {
  readonly candidates: readonly TSto[];
  readonly state?: StateSnapshot;
  readonly task?: Task;
  readonly tenantProcess?: TenantProcessDefinition;
}

export interface TenantProcessSelector<TSto = STO> {
  readonly name: string;
  readonly description?: string;
  select(context: TenantProcessSelectorContext<TSto>): TSto | undefined;
}
