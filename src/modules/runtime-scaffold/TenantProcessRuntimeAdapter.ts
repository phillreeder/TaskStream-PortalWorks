import type { StateDefinition } from '../../definitionRuntime/state/index.js';
import type { FlowExecutable } from '../../domain/tenantProcess/index.js';
import { RuntimeScaffoldExecutionError } from './errors.js';
import type {
  RuntimeScaffoldRuntimeFlow,
  RuntimeScaffoldRuntimeSto,
  RuntimeScaffoldRuntimeTask,
  RuntimeScaffoldRuntimeTenantProcess,
} from './RuntimeScaffoldPipelineTypes.js';

export function adaptTenantProcessForRuntimeScaffold(rawTenantProcess: unknown): RuntimeScaffoldRuntimeTenantProcess {
  const tenantProcess = expectRecord(rawTenantProcess, 'TenantProcess', 'TENANT_PROCESS_INVALID', 'tenant-process');
  const tasks = valuesFromRegistryOrArray(tenantProcess.tasks);
  const processFlows = valuesFromRegistryOrArray(tenantProcess.flows);
  const processStos = valuesFromRegistryOrArray(tenantProcess.stos);
  const stateDefinitions = asRecord(tenantProcess.stateDefinitions);

  if (tasks.length === 0) {
    throw new RuntimeScaffoldExecutionError({
      message: 'TenantProcess must expose at least one Task for flowOnly execution',
      code: 'TENANT_PROCESS_INVALID',
      phase: 'tenant-process',
    });
  }

  return {
    tenantProcessId: optionalString(tenantProcess.tenantProcessId ?? tenantProcess.id),
    tasks: tasks.map((task) => normalizeTask(task, {
      processFlows,
      processStos,
      stateDefinitions,
    })),
  };
}

function normalizeTask(
  rawTask: unknown,
  processBindings: {
    readonly processFlows: readonly unknown[];
    readonly processStos: readonly unknown[];
    readonly stateDefinitions?: Record<string, unknown>;
  },
): RuntimeScaffoldRuntimeTask {
  const task = expectRecord(rawTask, 'Task', 'TASK_BINDING_INVALID', 'task-resolution');
  const taskId = requiredString(task.taskId ?? task.id, 'Task id', 'TASK_BINDING_INVALID', 'task-resolution');
  const stateDefinition = resolveStateDefinition(task, processBindings.stateDefinitions);
  const stos = resolveStos(task, processBindings.processStos, processBindings.processFlows);
  const defaultStoId = resolveDefaultStoId(task, stos);

  if (stos.length === 0) {
    throw new RuntimeScaffoldExecutionError({
      message: `Task does not bind any STOs: ${taskId}`,
      code: 'TASK_BINDING_INVALID',
      phase: 'task-resolution',
      details: { taskId },
    });
  }

  return {
    taskId,
    stateDefinition,
    stos,
    ...(defaultStoId ? { defaultStoId } : {}),
  };
}

function resolveStateDefinition(task: Record<string, unknown>, stateDefinitions?: Record<string, unknown>): StateDefinition {
  const inlineDefinition = task.stateDefinition;
  if (isRecord(inlineDefinition)) {
    return inlineDefinition as StateDefinition;
  }

  const stateDefinitionRef = optionalString(task.stateDefinitionRef);
  if (stateDefinitionRef && stateDefinitions && isRecord(stateDefinitions[stateDefinitionRef])) {
    return stateDefinitions[stateDefinitionRef] as StateDefinition;
  }

  throw new RuntimeScaffoldExecutionError({
    message: 'Task does not bind a StateDefinition',
    code: 'TASK_BINDING_INVALID',
    phase: 'task-resolution',
    details: { taskId: task.taskId ?? task.id, stateDefinitionRef },
  });
}

function resolveStos(
  task: Record<string, unknown>,
  processStos: readonly unknown[],
  processFlows: readonly unknown[],
): readonly RuntimeScaffoldRuntimeSto[] {
  const inlineStos = valuesFromRegistryOrArray(task.stos);
  const stoRefs = Array.isArray(task.stoRefs) ? task.stoRefs : [];
  const resolvedRefStos = stoRefs
    .map((ref) => processStos.find((candidate) => runtimeId(candidate, 'stoId') === ref))
    .filter(isDefined);
  const rawStos = inlineStos.length > 0 ? inlineStos : resolvedRefStos;
  return rawStos.map((sto) => normalizeSto(sto, processFlows));
}

function normalizeSto(rawSto: unknown, processFlows: readonly unknown[]): RuntimeScaffoldRuntimeSto {
  const sto = expectRecord(rawSto, 'STO', 'FLOW_BINDING_INVALID', 'flow-resolution');
  const stoId = requiredString(sto.stoId ?? sto.id, 'STO id', 'FLOW_BINDING_INVALID', 'flow-resolution');
  const inlineFlow = isRecord(sto.flow) ? normalizeFlow(sto.flow) : undefined;
  const flowRef = optionalString(sto.flowRef);
  const flowFromRef = flowRef
    ? processFlows.map((flow) => normalizeFlow(flow)).find((flow) => flow.flowId === flowRef)
    : undefined;
  const flow = inlineFlow ?? flowFromRef;
  const declaredFlowId = flow?.flowId ?? flowRef;

  return {
    stoId,
    ...(flow ? { flow } : {}),
    ...(declaredFlowId ? { declaredFlowId } : {}),
  };
}

function normalizeFlow(rawFlow: unknown): RuntimeScaffoldRuntimeFlow {
  const flow = expectRecord(rawFlow, 'Flow', 'FLOW_BINDING_INVALID', 'flow-resolution');
  const flowId = requiredString(flow.flowId ?? flow.id, 'Flow id', 'FLOW_BINDING_INVALID', 'flow-resolution');
  if (typeof flow.executable !== 'function') {
    throw new RuntimeScaffoldExecutionError({
      message: `Flow does not expose an executable function: ${flowId}`,
      code: 'FLOW_BINDING_INVALID',
      phase: 'flow-resolution',
      details: { flowId },
    });
  }

  return {
    flowId,
    executable: flow.executable as FlowExecutable,
  };
}

function resolveDefaultStoId(
  task: Record<string, unknown>,
  stos: readonly RuntimeScaffoldRuntimeSto[],
): string | undefined {
  if (isRecord(task.defaultSto)) {
    const defaultStoId = runtimeId(task.defaultSto, 'stoId');
    return stos.find((sto) => sto.stoId === defaultStoId)?.stoId;
  }

  const defaultStoRef = optionalString(task.defaultStoRef);
  if (defaultStoRef) {
    return stos.find((sto) => sto.stoId === defaultStoRef)?.stoId;
  }

  return undefined;
}

function valuesFromRegistryOrArray(value: unknown): readonly unknown[] {
  if (Array.isArray(value)) {
    return value;
  }
  if (isRecord(value)) {
    return Object.values(value);
  }
  return [];
}

function runtimeId(value: unknown, alternateKey: string): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  return optionalString(value[alternateKey] ?? value.id);
}

function expectRecord(
  value: unknown,
  label: string,
  code: RuntimeScaffoldExecutionError['code'],
  phase: RuntimeScaffoldExecutionError['phase'],
): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new RuntimeScaffoldExecutionError({
      message: `${label} must be an object`,
      code,
      phase,
      details: { label },
    });
  }
  return value;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredString(
  value: unknown,
  label: string,
  code: RuntimeScaffoldExecutionError['code'],
  phase: RuntimeScaffoldExecutionError['phase'],
): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new RuntimeScaffoldExecutionError({
      message: `${label} must be a non-empty string`,
      code,
      phase,
      details: { label },
    });
  }
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}
