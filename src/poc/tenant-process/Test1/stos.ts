import {
  prepareWorkInputContract,
  workInspectedResultContract,
  workPreparedResultContract,
} from './contracts.js';
import { inspectWorkFlowDefinition, prepareWorkFlowDefinition } from './flowDefinitions.js';
import { IEBBETA_TEST1_TENANT_PROCESS_IDS } from './ids.js';

export const prepareWorkSto = {
  id: IEBBETA_TEST1_TENANT_PROCESS_IDS.stos.prepareWork,
  flow: prepareWorkFlowDefinition,
  inputContracts: [prepareWorkInputContract],
  resultContracts: [workPreparedResultContract],
};

export const inspectWorkSto = {
  id: IEBBETA_TEST1_TENANT_PROCESS_IDS.stos.inspectWork,
  flow: inspectWorkFlowDefinition,
  resultContracts: [workInspectedResultContract],
};
