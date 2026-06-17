export const RUNTIME_SCAFFOLD_TRACE_EVENTS = {
  descriptorLoading: {
    controlRead: 'descriptor-control-read',
    controlNormalize: 'descriptor-control-normalize',
    executionPathResolve: 'descriptor-execution-path-resolve',
    formatDetect: 'descriptor-format-detect',
    descriptorFileRead: 'descriptor-file-read',
    descriptorNormalize: 'descriptor-normalize',
  },
  runtimeSpine: {
    tenantProcessLoad: 'runtime-spine-tenant-process-load',
    tenantProcessValidate: 'runtime-spine-tenant-process-validate',
    taskResolve: 'runtime-spine-task-resolve',
    sourceStateLoad: 'runtime-spine-source-state-load',
    workingStatePrepare: 'runtime-spine-working-state-prepare',
    flowResolve: 'runtime-spine-flow-resolve',
    flowExecute: 'runtime-spine-flow-execute',
    resultWrite: 'runtime-spine-result-write',
  },
} as const;

export const RUNTIME_SCAFFOLD_TRACE_SELECTORS = {
  descriptorFileReadStart: {
    operation: RUNTIME_SCAFFOLD_TRACE_EVENTS.descriptorLoading.descriptorFileRead,
    phase: 'START',
  },
  descriptorFileReadEnd: {
    operation: RUNTIME_SCAFFOLD_TRACE_EVENTS.descriptorLoading.descriptorFileRead,
    phase: 'END',
  },
  descriptorNormalizeStart: {
    operation: RUNTIME_SCAFFOLD_TRACE_EVENTS.descriptorLoading.descriptorNormalize,
    phase: 'START',
  },
  descriptorNormalizeEnd: {
    operation: RUNTIME_SCAFFOLD_TRACE_EVENTS.descriptorLoading.descriptorNormalize,
    phase: 'END',
  },
  flowExecuteStart: {
    operation: RUNTIME_SCAFFOLD_TRACE_EVENTS.runtimeSpine.flowExecute,
    phase: 'START',
  },
  flowExecuteEnd: {
    operation: RUNTIME_SCAFFOLD_TRACE_EVENTS.runtimeSpine.flowExecute,
    phase: 'END',
  },
} as const;

export const RUNTIME_SCAFFOLD_TRACE_EVENT_OWNER = 'runtimeScaffold' as const;
