export const MODULE_LINK_TRACE_EVENTS = {
  routing: {
    registerRoute: 'modulelink.routing.register-route',
    dispatchEnvelope: 'modulelink.routing.dispatch-envelope',
  },
  systemTraceFacade: {
    createTracer: 'modulelink.systemtrace-facade.create-tracer',
    captureSpan: 'modulelink.systemtrace-facade.capture-span',
  },
} as const;

export const MODULE_LINK_TRACE_EVENT_OWNER = 'moduleLink' as const;
