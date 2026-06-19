import { IEBBETA_TEST1_TENANT_PROCESS_IDS } from './ids.js';
import { test1ProcessWorkTask } from './task.js';

export const iebBetaTest1TenantProcess = {
  id: IEBBETA_TEST1_TENANT_PROCESS_IDS.tenantProcess,
  tenantId: IEBBETA_TEST1_TENANT_PROCESS_IDS.tenant,
  processId: IEBBETA_TEST1_TENANT_PROCESS_IDS.process,
  version: 1,

  name: 'IEBBeta Test1',
  description: 'Governed POC TenantProcess structure for exercising the real Task, Channel, STO, and Flow model.',

  tasks: [test1ProcessWorkTask],
};
