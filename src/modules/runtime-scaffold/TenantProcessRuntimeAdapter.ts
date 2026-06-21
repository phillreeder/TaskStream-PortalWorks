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
  const tasks = entriesFromRegistryOrArray(tenantProcess.tasks);
  const processFlows = entriesFromRegistryOrArray(tenantProcess.flows);
  const processStos = entriesFromRegistryOrArray(tenantProcess.stos);
  const stateDefinitions = asRecord(tenantProcess.stateDefinitions);

  if (tasks.length === 0) {
    throw new RuntimeScaffoldExecutionError({
      message: 'TenantProcess must expose at least one Task for flowOnly execution',
      code: 'TENANT_PROCESS_INVALID',
      phase: 'tenant-process',
    });
  }

  return {
    tenantProcessId: optionalString(tenantProcess.name ?? tenantProcess.tenantProcessId ?? tenantProcess.id),
    tasks: tasks.map(([taskName, task]) => normalizeTask(task, taskName, {
      processFlows,
      processStos,
      stateDefinitions,
    })),
  };
}

function normalizeTask(
  rawTask: unknown,
  taskName: string | undefined,
  processBindings: {
    readonly processFlows: readonly (readonly [string | undefined, unknown])[];
    readonly processStos: readonly (readonly [string | undefined, unknown])[];
    readonly stateDefinitions?: Record<string, unknown>;
  },
): RuntimeScaffoldRuntimeTask {
  const task = expectRecord(rawTask, 'Task', 'TASK_BINDING_INVALID', 'task-resolution');
  const taskId = requiredString(taskName ?? task.taskId ?? task.id, 'Task id', 'TASK_BINDING_INVALID', 'task-resolution');
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
  processStos: readonly (readonly [string | undefined, unknown])[],
  processFlows: readonly (readonly [string | undefined, unknown])[],
): readonly RuntimeScaffoldRuntimeSto[] {
  const inlineStos = entriesFromRegistryOrArray(task.stos);
  const stoRefs = Array.isArray(task.stoRefs) ? task.stoRefs : [];
  const resolvedRefStos = stoRefs
    .map((ref) => processStos.find(([name, candidate]) => runtimeId(candidate, 'stoId') === ref || name === ref))
    .filter(isDefined);
  const rawStos = inlineStos.length > 0 ? inlineStos : resolvedRefStos;
  return rawStos.map(([stoName, sto]) => normalizeSto(sto, stoName, processFlows));
}

function normalizeSto(
  rawSto: unknown,
  stoName: string | undefined,
  processFlows: readonly (readonly [string | undefined, unknown])[],
): RuntimeScaffoldRuntimeSto {
  const sto = expectRecord(rawSto, 'STO', 'FLOW_BINDING_INVALID', 'flow-resolution');
  const stoId = requiredString(stoName ?? sto.stoId ?? sto.id, 'STO id', 'FLOW_BINDING_INVALID', 'flow-resolution');
  const inlineFlow = typeof sto.flow === 'function' || isRecord(sto.flow)
    ? normalizeFlow(sto.flow, stoId)
    : undefined;
  const flowRef = optionalString(sto.flowRef);
  const flowFromRef = flowRef
    ? processFlows.map(([name, flow]) => normalizeFlow(flow, name)).find((flow) => flow.flowId === flowRef)
    : undefined;
  const flow = inlineFlow ?? flowFromRef;
  const declaredFlowId = flow?.flowId ?? flowRef;

  return {
    stoId,
    ...(flow ? { flow } : {}),
    ...(declaredFlowId ? { declaredFlowId } : {}),
  };
}

function normalizeFlow(rawFlow: unknown, flowName?: string): RuntimeScaffoldRuntimeFlow {
  if (typeof rawFlow === 'function') {
    return {
      flowId: requiredString(flowName, 'Flow id', 'FLOW_BINDING_INVALID', 'flow-resolution'),
      executable: rawFlow as FlowExecutable,
    };
  }

  const flow = expectRecord(rawFlow, 'Flow', 'FLOW_BINDING_INVALID', 'flow-resolution');
  const flowId = requiredString(flowName ?? flow.flowId ?? flow.id, 'Flow id', 'FLOW_BINDING_INVALID', 'flow-resolution');
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
    const defaultEntry = entriesFromRegistryOrArray(task.stos).find(([, sto]) => sto === task.defaultSto);
    const defaultStoId = defaultEntry?.[0] ?? runtimeId(task.defaultSto, 'stoId');
    return stos.find((sto) => sto.stoId === defaultStoId)?.stoId;
  }

  const defaultStoRef = optionalString(task.defaultStoRef);
  if (defaultStoRef) {
    return stos.find((sto) => sto.stoId === defaultStoRef)?.stoId;
  }

  return undefined;
}

function entriesFromRegistryOrArray(value: unknown): readonly (readonly [string | undefined, unknown])[] {
  if (Array.isArray(value)) {
    return value.map((entry) => [undefined, entry] as const);
  }
  if (isRecord(value)) {
    return Object.entries(value);
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
