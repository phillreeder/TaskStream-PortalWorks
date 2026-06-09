export const RUNTIME_SCAFFOLD_TRACE_EVENTS = {
  descriptorLoading: {
    controlRead: 'descriptor-control-read',
    controlNormalize: 'descriptor-control-normalize',
    executionPathResolve: 'descriptor-execution-path-resolve',
    formatDetect: 'descriptor-format-detect',
    descriptorFileRead: 'descriptor-file-read',
    descriptorNormalize: 'descriptor-normalize',
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
} as const;

export const RUNTIME_SCAFFOLD_TRACE_EVENT_OWNER = 'runtimeScaffold' as const;
