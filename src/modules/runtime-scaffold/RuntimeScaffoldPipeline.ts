import { RUNTIME_SCAFFOLD_TRACE_EVENTS } from '../../trace-events/index.js';
import { RuntimeScaffoldExecutionError } from './errors.js';
import {
  buildRuntimeScaffoldExecutionResultBase,
  buildRuntimeScaffoldTraceSummary,
} from './ExecutionResultBuilder.js';
import { adaptTenantProcessForRuntimeScaffold } from './TenantProcessRuntimeAdapter.js';
import { RuntimeScaffoldPipelineTracer } from './RuntimeScaffoldPipelineTracer.js';
import { resolveRuntimeScaffoldFlowSelection, resolveRuntimeScaffoldTask } from './RuntimeScaffoldResolver.js';
import { ScaffoldFlowRunner } from './ScaffoldFlowRunner.js';
import { SourceStateLoader } from './SourceStateLoader.js';
import { prepareRuntimeScaffoldWorkingState } from './WorkingStatePreparer.js';
import type { ResultWriter } from './ResultWriter.js';
import type {
  RuntimeScaffoldExecutedExecution,
  RuntimeScaffoldFlowResolvedExecution,
  RuntimeScaffoldLoadedExecution,
  RuntimeScaffoldOutputExecution,
  RuntimeScaffoldPipelineObserver,
  RuntimeScaffoldPreparedExecution,
  RuntimeScaffoldTraceSummary,
  RuntimeScaffoldTaskResolvedExecution,
  RuntimeScaffoldValidatedExecution,
} from './RuntimeScaffoldPipelineTypes.js';
import type { TenantProcessLoader } from './TenantProcessLoader.js';
import type { RuntimeScaffoldExecutionSuccess, RuntimeScaffoldLoadSuccess } from './types.js';
import { validateRuntimeScaffoldProposedState } from './ProposedStateValidator.js';

export interface RuntimeScaffoldPipelineDependencies {
  readonly tenantProcessLoader: TenantProcessLoader;
  readonly sourceStateLoader: SourceStateLoader;
  readonly flowRunner: ScaffoldFlowRunner;
  readonly resultWriter: ResultWriter;
  readonly tracer: RuntimeScaffoldPipelineTracer;
  readonly stageObserver?: RuntimeScaffoldPipelineObserver;
}

const runtimeEvents = RUNTIME_SCAFFOLD_TRACE_EVENTS.runtimeSpine;

export async function runRuntimeScaffoldPipeline(
  load: RuntimeScaffoldLoadSuccess,
  dependencies: RuntimeScaffoldPipelineDependencies,
): Promise<RuntimeScaffoldExecutionSuccess> {
  const loaded = await loadRuntimeScaffoldExecution(load, dependencies);
  const taskResolved = await resolveRuntimeScaffoldTaskExecution(loaded, dependencies);
  const prepared = await prepareRuntimeScaffoldExecution(taskResolved, dependencies);
  const executed = await executeRuntimeScaffoldExecution(prepared, dependencies);
  const validated = validateRuntimeScaffoldExecution(executed, dependencies);
  const output = await outputRuntimeScaffoldExecution(validated, dependencies);
  return {
    ...output.output.result,
    ...output.artifactRefs,
  };
}

export async function loadRuntimeScaffoldExecution(
  load: RuntimeScaffoldLoadSuccess,
  dependencies: RuntimeScaffoldPipelineDependencies,
): Promise<RuntimeScaffoldLoadedExecution> {
  dependencies.stageObserver?.('load');
  const descriptor = load.descriptor;

  if (descriptor.mode !== 'flowOnly') {
    throw new RuntimeScaffoldExecutionError({
      message: `RuntimeScaffold executable spine currently supports flowOnly only, received ${descriptor.mode}`,
      code: 'EXECUTION_MODE_UNSUPPORTED',
      phase: 'mode',
      details: { mode: descriptor.mode },
    });
  }

  const tenantProcessContext = {
    descriptorId: descriptor.id,
    tenantProcessRef: descriptor.tenantProcessRef,
  };
  await dependencies.tracer.started(runtimeEvents.tenantProcessLoad, tenantProcessContext);
  let tenantProcess: unknown;
  try {
    tenantProcess = await dependencies.tenantProcessLoader.load({
      reference: descriptor.tenantProcessRef,
      executionPath: load.executionPath,
    });
    await dependencies.tracer.completed(runtimeEvents.tenantProcessLoad, tenantProcessContext);
  } catch (error) {
    await dependencies.tracer.failed(runtimeEvents.tenantProcessLoad, { ...tenantProcessContext, error: traceError(error) });
    throw error;
  }

  const validateContext = {
    descriptorId: descriptor.id,
  };
  await dependencies.tracer.started(runtimeEvents.tenantProcessValidate, validateContext);
  let runtimeTenantProcess;
  try {
    runtimeTenantProcess = adaptTenantProcessForRuntimeScaffold(tenantProcess);
    await dependencies.tracer.completed(runtimeEvents.tenantProcessValidate, validateContext);
  } catch (error) {
    await dependencies.tracer.failed(runtimeEvents.tenantProcessValidate, { ...validateContext, error: traceError(error) });
    throw error;
  }

  return {
    load,
    descriptor,
    tenantProcess: runtimeTenantProcess,
    trace: dependencies.tracer.trace,
  };
}

export async function resolveRuntimeScaffoldTaskExecution(
  execution: RuntimeScaffoldLoadedExecution,
  dependencies: RuntimeScaffoldPipelineDependencies,
): Promise<RuntimeScaffoldTaskResolvedExecution> {
  dependencies.stageObserver?.('resolve');
  const context = {
    descriptorId: execution.descriptor.id,
    taskId: execution.descriptor.taskId,
  };
  await dependencies.tracer.started(runtimeEvents.taskResolve, context);
  let task;
  try {
    task = resolveRuntimeScaffoldTask(execution.tenantProcess, execution.descriptor.taskId);
    await dependencies.tracer.completed(runtimeEvents.taskResolve, context);
  } catch (error) {
    await dependencies.tracer.failed(runtimeEvents.taskResolve, { ...context, error: traceError(error) });
    throw error;
  }

  return {
    ...execution,
    task,
  };
}

export async function prepareRuntimeScaffoldExecution(
  execution: RuntimeScaffoldTaskResolvedExecution,
  dependencies: RuntimeScaffoldPipelineDependencies,
): Promise<RuntimeScaffoldPreparedExecution> {
  dependencies.stageObserver?.('prepare');
  const sourceStateContext = {
    descriptorId: execution.descriptor.id,
    sourceStateRef: execution.descriptor.sourceStateRef,
  };
  await dependencies.tracer.started(runtimeEvents.sourceStateLoad, sourceStateContext);
  let sourceState: unknown;
  try {
    sourceState = await dependencies.sourceStateLoader.load(execution.load);
    await dependencies.tracer.completed(runtimeEvents.sourceStateLoad, sourceStateContext);
  } catch (error) {
    await dependencies.tracer.failed(runtimeEvents.sourceStateLoad, { ...sourceStateContext, error: traceError(error) });
    throw error;
  }

  const workingStateContext = {
    descriptorId: execution.descriptor.id,
    taskId: execution.task.taskId,
  };
  await dependencies.tracer.started(runtimeEvents.workingStatePrepare, workingStateContext);
  let workingState;
  try {
    workingState = prepareRuntimeScaffoldWorkingState(execution.task.stateDefinition, sourceState);
    await dependencies.tracer.completed(runtimeEvents.workingStatePrepare, workingStateContext);
  } catch (error) {
    await dependencies.tracer.failed(runtimeEvents.workingStatePrepare, { ...workingStateContext, error: traceError(error) });
    throw error;
  }

  return {
    ...execution,
    sourceState,
    workingState,
  };
}

export async function resolveRuntimeScaffoldFlowExecution(
  execution: RuntimeScaffoldPreparedExecution,
  dependencies: RuntimeScaffoldPipelineDependencies,
): Promise<RuntimeScaffoldFlowResolvedExecution> {
  const context = {
    descriptorId: execution.descriptor.id,
    taskId: execution.task.taskId,
    flowId: execution.descriptor.execution?.flowId,
    stoId: execution.descriptor.execution?.stoId,
  };
  await dependencies.tracer.started(runtimeEvents.flowResolve, context);
  let flowSelection;
  try {
    flowSelection = resolveRuntimeScaffoldFlowSelection(
      execution.task,
      execution.descriptor.execution?.flowId,
      execution.descriptor.execution?.stoId,
    );
    await dependencies.tracer.completed(runtimeEvents.flowResolve, {
      ...context,
      flowId: flowSelection.flow.flowId,
      stoId: flowSelection.sto.stoId,
    });
  } catch (error) {
    await dependencies.tracer.failed(runtimeEvents.flowResolve, { ...context, error: traceError(error) });
    throw error;
  }

  return {
    ...execution,
    flowSelection,
  };
}

export async function executeRuntimeScaffoldExecution(
  execution: RuntimeScaffoldPreparedExecution,
  dependencies: RuntimeScaffoldPipelineDependencies,
): Promise<RuntimeScaffoldExecutedExecution> {
  dependencies.stageObserver?.('execute');
  const flowResolved = await resolveRuntimeScaffoldFlowExecution(execution, dependencies);
  const context = {
    descriptorId: flowResolved.descriptor.id,
    taskId: flowResolved.task.taskId,
    stoId: flowResolved.flowSelection.sto.stoId,
    flowId: flowResolved.flowSelection.flow.flowId,
  };
  await dependencies.tracer.started(runtimeEvents.flowExecute, context);
  let flowResult;
  try {
    flowResult = await dependencies.flowRunner.run(flowResolved);
    await dependencies.tracer.completed(runtimeEvents.flowExecute, {
      ...context,
      flowStatus: flowResult.status,
    });
  } catch (error) {
    await dependencies.tracer.failed(runtimeEvents.flowExecute, { ...context, error: traceError(error) });
    throw error;
  }

  return {
    ...flowResolved,
    flowResult,
    proposedState: flowResolved.workingState.container.snapshot(),
  };
}

export function validateRuntimeScaffoldExecution(
  execution: RuntimeScaffoldExecutedExecution,
  dependencies: RuntimeScaffoldPipelineDependencies,
): RuntimeScaffoldValidatedExecution {
  dependencies.stageObserver?.('validate');
  return validateRuntimeScaffoldProposedState(execution);
}

export async function outputRuntimeScaffoldExecution(
  execution: RuntimeScaffoldValidatedExecution,
  dependencies: RuntimeScaffoldPipelineDependencies,
): Promise<RuntimeScaffoldOutputExecution> {
  dependencies.stageObserver?.('output');
  const result = buildRuntimeScaffoldExecutionResultBase(execution);
  let traceSummary: RuntimeScaffoldTraceSummary | undefined;
  const context = {
    descriptorId: execution.descriptor.id,
    writeResult: execution.descriptor.output?.writeResult === true,
    writeTrace: execution.descriptor.output?.writeTrace === true,
  };
  await dependencies.tracer.started(runtimeEvents.resultWrite, context);
  let artifactRefs;
  try {
    traceSummary = buildRuntimeScaffoldTraceSummary(execution);
    artifactRefs = await dependencies.resultWriter.write({
      executionPath: execution.load.executionPath,
      descriptor: execution.descriptor,
      result,
      traceSummary,
    });
    await dependencies.tracer.completed(runtimeEvents.resultWrite, {
      ...context,
      artifactRefs,
    });
  } catch (error) {
    await dependencies.tracer.failed(runtimeEvents.resultWrite, { ...context, error: traceError(error) });
    throw error;
  }

  return {
    ...execution,
    output: {
      result,
      traceSummary: traceSummary ?? buildRuntimeScaffoldTraceSummary(execution),
    },
    artifactRefs,
  };
}

function traceError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const maybeCode = (error as Error & { readonly code?: unknown }).code;
    return {
      name: error.name,
      message: error.message,
      ...(typeof maybeCode === 'string' ? { code: maybeCode } : {}),
    };
  }
  return {
    name: typeof error,
    message: String(error),
  };
}
