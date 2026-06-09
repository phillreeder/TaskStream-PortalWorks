export const STREAM_STATE_TRACE_EVENTS = {
  consolidation: {
    applyChangeSet: 'streamstate.consolidation.apply-change-set',
    rejectInvalidChange: 'streamstate.consolidation.reject-invalid-change',
  },
} as const;

export const STREAM_STATE_TRACE_EVENT_OWNER = 'streamState' as const;
