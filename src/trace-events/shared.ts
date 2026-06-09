export const SHARED_TRACE_EVENTS = {
  catalog: {
    validateUniqueness: 'shared.trace-event-catalog.validate-uniqueness',
    exportStructure: 'shared.trace-event-catalog.export-structure',
  },
  orderProof: {
    assertBeforeBySeq: 'shared.systemtrace-order.assert-before-by-seq',
  },
} as const;

export const SHARED_TRACE_EVENT_OWNER = 'shared' as const;
