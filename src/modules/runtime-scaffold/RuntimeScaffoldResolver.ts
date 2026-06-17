import { RuntimeScaffoldExecutionError } from './errors.js';
import type {
  RuntimeScaffoldFlowSelection,
  RuntimeScaffoldRuntimeTask,
  RuntimeScaffoldRuntimeTenantProcess,
} from './RuntimeScaffoldPipelineTypes.js';

export function resolveRuntimeScaffoldTask(
  tenantProcess: RuntimeScaffoldRuntimeTenantProcess,
  taskId: string,
): RuntimeScaffoldRuntimeTask {
  const task = tenantProcess.tasks.find((candidate) => candidate.taskId === taskId);
  if (!task) {
    throw new RuntimeScaffoldExecutionError({
      message: `TenantProcess Task not found: ${taskId}`,
      code: 'TASK_NOT_FOUND',
      phase: 'task-resolution',
      details: { taskId },
    });
  }
  return task;
}

export function resolveRuntimeScaffoldFlowSelection(
  task: RuntimeScaffoldRuntimeTask,
  requestedFlowId?: string,
  requestedStoId?: string,
): RuntimeScaffoldFlowSelection {
  const sto = requestedStoId
    ? task.stos.find((candidate) => candidate.stoId === requestedStoId)
    : requestedFlowId
      ? task.stos.find((candidate) => candidate.declaredFlowId === requestedFlowId)
      : task.stos.find((candidate) => candidate.stoId === task.defaultStoId) ?? task.stos[0];

  if (!sto) {
    throw new RuntimeScaffoldExecutionError({
      message: requestedStoId
        ? `Task STO not found: ${requestedStoId}`
        : `Task Flow not found: ${requestedFlowId ?? '<default>'}`,
      code: requestedStoId ? 'TASK_BINDING_INVALID' : 'FLOW_NOT_FOUND',
      phase: 'flow-resolution',
      details: { taskId: task.taskId, requestedFlowId, requestedStoId },
    });
  }

  if (!sto.flow) {
    throw new RuntimeScaffoldExecutionError({
      message: `Selected STO does not bind an executable Flow: ${sto.stoId}`,
      code: 'FLOW_BINDING_INVALID',
      phase: 'flow-resolution',
      details: { taskId: task.taskId, stoId: sto.stoId, declaredFlowId: sto.declaredFlowId },
    });
  }

  if (requestedFlowId && sto.flow.flowId !== requestedFlowId) {
    throw new RuntimeScaffoldExecutionError({
      message: `Selected STO resolved Flow ${sto.flow.flowId}, not requested Flow ${requestedFlowId}`,
      code: 'FLOW_NOT_FOUND',
      phase: 'flow-resolution',
      details: { taskId: task.taskId, requestedFlowId, selectedFlowId: sto.flow.flowId },
    });
  }

  return {
    task,
    sto,
    flow: sto.flow,
  };
}
