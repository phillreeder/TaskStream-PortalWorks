export const IEBBETA_TEST1_TENANT_PROCESS_IDS = {
  tenantProcess: 'tenant-process.ieb-beta.test1',
  tenant: 'tenant.ieb-beta',
  process: 'test1',
  task: 'task.test1.process-work',
  channel: 'channel.test1.process-work',
  requests: {
    prepareWork: 'request.test1.prepare-work',
    inspectWork: 'request.test1.inspect-work',
  },
  stateDefinition: 'test1-process-work-state',
  flows: {
    prepareWork: 'flow.test1.prepare-work',
    inspectWork: 'flow.test1.inspect-work',
  },
  stos: {
    prepareWork: 'sto.test1.prepare-work',
    inspectWork: 'sto.test1.inspect-work',
  },
  inputContracts: {
    prepareWork: 'input.test1.prepare-work',
  },
  resultContracts: {
    workPrepared: 'result.test1.work-prepared',
    workInspected: 'result.test1.work-inspected',
  },
} as const;
