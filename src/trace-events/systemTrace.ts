export const SYSTEM_TRACE_EVENTS = {
  recorder: {
    captureRecord: 'systemtrace.recorder.capture-record',
    adapterFailure: 'systemtrace.recorder.adapter-failure',
  },
  output: {
    verifyJsonl: 'systemtrace.output.verify-jsonl',
    verifySpanClosure: 'systemtrace.output.verify-span-closure',
  },
} as const;

export const SYSTEM_TRACE_EVENT_OWNER = 'systemTrace' as const;
