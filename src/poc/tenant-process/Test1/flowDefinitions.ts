import { inspectWorkFlow, prepareWorkFlow } from './flows.js';
import { IEBBETA_TEST1_TENANT_PROCESS_IDS } from './ids.js';

export const prepareWorkFlowDefinition = {
  id: IEBBETA_TEST1_TENANT_PROCESS_IDS.flows.prepareWork,
  executable: prepareWorkFlow,
};

export const inspectWorkFlowDefinition = {
  id: IEBBETA_TEST1_TENANT_PROCESS_IDS.flows.inspectWork,
  executable: inspectWorkFlow,
};
