import type { StateContainer, StateDefinition } from '../../definitionRuntime/state/index.js';
import type { FlowExecutable, FlowResult } from '../../domain/tenantProcess/index.js';
import type {
  RuntimeScaffoldArtifactRefs,
  RuntimeScaffoldDescriptor,
  RuntimeScaffoldExecutionSuccess,
  RuntimeScaffoldLoadSuccess,
  RuntimeScaffoldValidationSummary,
} from './types.js';

export type RuntimeScaffoldPipelineStageName = 'load' | 'resolve' | 'prepare' | 'execute' | 'validate' | 'output';

export type RuntimeScaffoldPipelineObserver = (stageName: RuntimeScaffoldPipelineStageName) => void;

export interface RuntimeScaffoldPipelineTrace {
  readonly operations: string[];
}

export interface RuntimeScaffoldRuntimeFlow {
  readonly flowId: string;
  readonly executable: FlowExecutable;
}

export interface RuntimeScaffoldRuntimeSto {
  readonly stoId: string;
  readonly flow?: RuntimeScaffoldRuntimeFlow;
  readonly declaredFlowId?: string;
}

export interface RuntimeScaffoldRuntimeTask {
  readonly taskId: string;
  readonly stateDefinition: StateDefinition;
  readonly stos: readonly RuntimeScaffoldRuntimeSto[];
  readonly defaultStoId?: string;
}

export interface RuntimeScaffoldRuntimeTenantProcess {
  readonly tenantProcessId?: string;
  readonly tasks: readonly RuntimeScaffoldRuntimeTask[];
}

export interface RuntimeScaffoldFlowSelection {
  readonly task: RuntimeScaffoldRuntimeTask;
  readonly sto: RuntimeScaffoldRuntimeSto;
  readonly flow: RuntimeScaffoldRuntimeFlow;
}

export interface RuntimeScaffoldWorkingState {
  readonly previousState: unknown;
  readonly container: StateContainer;
}

export interface RuntimeScaffoldLoadedExecution {
  readonly load: RuntimeScaffoldLoadSuccess;
  readonly descriptor: RuntimeScaffoldDescriptor;
  readonly tenantProcess: RuntimeScaffoldRuntimeTenantProcess;
  readonly trace: RuntimeScaffoldPipelineTrace;
}

export interface RuntimeScaffoldTaskResolvedExecution extends RuntimeScaffoldLoadedExecution {
  readonly task: RuntimeScaffoldRuntimeTask;
}

export interface RuntimeScaffoldPreparedExecution extends RuntimeScaffoldTaskResolvedExecution {
  readonly sourceState: unknown;
  readonly workingState: RuntimeScaffoldWorkingState;
}

export interface RuntimeScaffoldFlowResolvedExecution extends RuntimeScaffoldPreparedExecution {
  readonly flowSelection: RuntimeScaffoldFlowSelection;
}

export interface RuntimeScaffoldExecutedExecution extends RuntimeScaffoldFlowResolvedExecution {
  readonly flowResult: FlowResult;
  readonly proposedState: unknown;
}

export interface RuntimeScaffoldValidatedExecution extends RuntimeScaffoldExecutedExecution {
  readonly validation: RuntimeScaffoldValidationSummary;
}

export type RuntimeScaffoldExecutionResultBase = Omit<
  RuntimeScaffoldExecutionSuccess,
  keyof RuntimeScaffoldArtifactRefs
>;

export interface RuntimeScaffoldTraceSummary {
  readonly descriptorId: string;
  readonly runtimeSlice: 'flowonly-runtime-spine-v1';
  readonly operations: readonly string[];
  readonly selectedFlowId: string;
  readonly selectedStoId: string;
  readonly validation: RuntimeScaffoldValidationSummary;
}

export interface RuntimeScaffoldOutputMaterial {
  readonly result: RuntimeScaffoldExecutionResultBase;
  readonly traceSummary: RuntimeScaffoldTraceSummary;
}

export interface RuntimeScaffoldOutputExecution extends RuntimeScaffoldValidatedExecution {
  readonly output: RuntimeScaffoldOutputMaterial;
  readonly artifactRefs: RuntimeScaffoldArtifactRefs;
}
