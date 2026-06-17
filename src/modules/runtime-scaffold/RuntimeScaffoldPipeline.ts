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

  const tenantProcess = await dependencies.tracer.traceValue(runtimeEvents.tenantProcessLoad, {
    descriptorId: descriptor.id,
    tenantProcessRef: descriptor.tenantProcessRef,
  }, () => dependencies.tenantProcessLoader.load({
    reference: descriptor.tenantProcessRef,
    executionPath: load.executionPath,
  }));

  const runtimeTenantProcess = await dependencies.tracer.traceValue(runtimeEvents.tenantProcessValidate, {
    descriptorId: descriptor.id,
  }, () => adaptTenantProcessForRuntimeScaffold(tenantProcess));

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
  const task = await dependencies.tracer.traceValue(runtimeEvents.taskResolve, {
    descriptorId: execution.descriptor.id,
    taskId: execution.descriptor.taskId,
  }, () => resolveRuntimeScaffoldTask(execution.tenantProcess, execution.descriptor.taskId));

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
  const sourceState = await dependencies.tracer.traceValue(runtimeEvents.sourceStateLoad, {
    descriptorId: execution.descriptor.id,
    sourceStateRef: execution.descriptor.sourceStateRef,
  }, () => dependencies.sourceStateLoader.load(execution.load));

  const workingState = await dependencies.tracer.traceValue(runtimeEvents.workingStatePrepare, {
    descriptorId: execution.descriptor.id,
    taskId: execution.task.taskId,
  }, () => prepareRuntimeScaffoldWorkingState(execution.task.stateDefinition, sourceState));

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
  const flowSelection = await dependencies.tracer.traceValue(runtimeEvents.flowResolve, {
    descriptorId: execution.descriptor.id,
    taskId: execution.task.taskId,
    flowId: execution.descriptor.execution?.flowId,
    stoId: execution.descriptor.execution?.stoId,
  }, () => resolveRuntimeScaffoldFlowSelection(
    execution.task,
    execution.descriptor.execution?.flowId,
    execution.descriptor.execution?.stoId,
  ));

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
  const flowResult = await dependencies.tracer.traceValue(runtimeEvents.flowExecute, {
    descriptorId: flowResolved.descriptor.id,
    taskId: flowResolved.task.taskId,
    stoId: flowResolved.flowSelection.sto.stoId,
    flowId: flowResolved.flowSelection.flow.flowId,
  }, () => dependencies.flowRunner.run(flowResolved));

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
  const artifactRefs = await dependencies.tracer.traceValue(runtimeEvents.resultWrite, {
    descriptorId: execution.descriptor.id,
    writeResult: execution.descriptor.output?.writeResult === true,
    writeTrace: execution.descriptor.output?.writeTrace === true,
  }, () => {
    traceSummary = buildRuntimeScaffoldTraceSummary(execution);
    return dependencies.resultWriter.write({
      executionPath: execution.load.executionPath,
      descriptor: execution.descriptor,
      result,
      traceSummary,
    });
  });

  return {
    ...execution,
    output: {
      result,
      traceSummary: traceSummary ?? buildRuntimeScaffoldTraceSummary(execution),
    },
    artifactRefs,
  };
}
