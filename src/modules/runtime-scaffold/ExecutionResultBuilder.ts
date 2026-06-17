import type {
  RuntimeScaffoldExecutionResultBase,
  RuntimeScaffoldOutputMaterial,
  RuntimeScaffoldTraceSummary,
  RuntimeScaffoldValidatedExecution,
} from './RuntimeScaffoldPipelineTypes.js';

export function buildRuntimeScaffoldExecutionResultBase(
  execution: RuntimeScaffoldValidatedExecution,
): RuntimeScaffoldExecutionResultBase {
  return {
    ok: true,
    status: 'succeeded',
    controlPath: execution.load.controlPath,
    executionPath: execution.load.executionPath,
    executionFormat: execution.load.executionFormat,
    descriptorId: execution.descriptor.id,
    descriptor: execution.descriptor,
    mode: execution.descriptor.mode,
    tenantProcessId: execution.tenantProcess.tenantProcessId,
    taskId: execution.task.taskId,
    selectedStoId: execution.flowSelection.sto.stoId,
    selectedFlowId: execution.flowSelection.flow.flowId,
    previousState: execution.workingState.previousState,
    proposedState: execution.proposedState,
    validation: execution.validation,
    flowResult: execution.flowResult,
    warnings: execution.load.warnings,
  };
}

export function buildRuntimeScaffoldTraceSummary(
  execution: RuntimeScaffoldValidatedExecution,
): RuntimeScaffoldTraceSummary {
  return {
    descriptorId: execution.descriptor.id,
    runtimeSlice: 'flowonly-runtime-spine-v1',
    operations: [...execution.trace.operations],
    selectedFlowId: execution.flowSelection.flow.flowId,
    selectedStoId: execution.flowSelection.sto.stoId,
    validation: execution.validation,
  };
}

export function buildRuntimeScaffoldOutputMaterial(
  execution: RuntimeScaffoldValidatedExecution,
): RuntimeScaffoldOutputMaterial {
  return {
    result: buildRuntimeScaffoldExecutionResultBase(execution),
    traceSummary: buildRuntimeScaffoldTraceSummary(execution),
  };
}
