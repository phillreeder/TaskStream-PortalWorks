import {
  prepareWorkInputContract,
  workInspectedResultContract,
  workPreparedResultContract,
} from './contracts.js';
import { inspectWorkFlow, prepareWorkFlow } from './flows.js';

export const prepareWorkSto = {
  flow: prepareWorkFlow,
  inputContracts: [prepareWorkInputContract],
  resultContracts: [workPreparedResultContract],
};

export const inspectWorkSto = {
  flow: inspectWorkFlow,
  resultContracts: [workInspectedResultContract],
};
