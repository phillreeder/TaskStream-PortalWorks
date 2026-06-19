import { IEBBETA_TEST1_TENANT_PROCESS_IDS } from './ids.js';

export const prepareWorkInputContract = {
  id: IEBBETA_TEST1_TENANT_PROCESS_IDS.inputContracts.prepareWork,
  inputKind: 'json',
  schemaRef: 'schema.test1.prepare-work-input',
};

export const workPreparedResultContract = {
  id: IEBBETA_TEST1_TENANT_PROCESS_IDS.resultContracts.workPrepared,
  schemaRef: 'schema.test1.work-prepared-result',
  statusValues: ['succeeded', 'failed', 'cancelled'],
};

export const workInspectedResultContract = {
  id: IEBBETA_TEST1_TENANT_PROCESS_IDS.resultContracts.workInspected,
  schemaRef: 'schema.test1.work-inspected-result',
  statusValues: ['succeeded', 'failed', 'cancelled'],
};
