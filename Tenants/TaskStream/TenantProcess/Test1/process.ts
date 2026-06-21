import { test1ProcessWorkChannel } from './channels.js';
import {
  prepareWorkInputContract,
  workInspectedResultContract,
  workPreparedResultContract,
} from './contracts.js';
import { test1ProcessWorkStateDefinition } from './stateDefinition.js';
import { inspectWorkSto, prepareWorkSto } from './stos.js';
import { test1ProcessWorkTask } from './task.js';

export const iebBetaTest1TenantProcess = {
  id: { tenant: 'TaskStream', process: 'Test1' },
  name: 'Test1',
  version: 1,
  description: 'Governed POC TenantProcess structure for exercising the real Task, Channel, STO, and Flow model.',

  tasks: {
    processWork: test1ProcessWorkTask,
  },
  channels: {
    processWork: test1ProcessWorkChannel,
  },
  stos: {
    prepareWork: prepareWorkSto,
    inspectWork: inspectWorkSto,
  },
  stateDefinitions: {
    processWork: test1ProcessWorkStateDefinition,
  },
  inputContracts: {
    prepareWork: prepareWorkInputContract,
  },
  resultContracts: {
    workPrepared: workPreparedResultContract,
    workInspected: workInspectedResultContract,
  },
};
