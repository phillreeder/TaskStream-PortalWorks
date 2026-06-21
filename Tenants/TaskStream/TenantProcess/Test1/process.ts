import { TenantProcess } from '@TaskStream/App/domain/tenantProcess/index.js';
import { test1ProcessWorkChannel } from './channels.js';
import {
  prepareWorkInputContract,
  workInspectedResultContract,
  workPreparedResultContract,
} from './contracts.js';
import { inspectWorkFlow, prepareWorkFlow } from './flows.js';
import { test1ProcessWorkStateDefinition } from './stateDefinition.js';
import { inspectWorkSto, prepareWorkSto } from './stos.js';
import { test1ProcessWorkTask } from './task.js';

export const iebBetaTest1TenantProcess = TenantProcess.define({
  id: { tenant: 'TaskStream', process: 'Test1' },
  name: 'Test1',
  version: 1,
  description: 'Governed POC TenantProcess structure for exercising the real Task, Channel, STO, and Flow model.',
}, ({ tp }) => {
  const stateDefinitions = tp.stateDefinitions({
    processWork: test1ProcessWorkStateDefinition,
  });

  const channels = tp.channels({
    processWork: test1ProcessWorkChannel,
  });

  const inputContracts = tp.inputContracts({
    prepareWork: prepareWorkInputContract,
  });

  const resultContracts = tp.resultContracts({
    workPrepared: workPreparedResultContract,
    workInspected: workInspectedResultContract,
  });

  const stos = tp.stos({
    prepareWork: {
      ...prepareWorkSto,
      flow: prepareWorkFlow,
      inputContracts: [inputContracts.prepareWork],
      resultContracts: [resultContracts.workPrepared],
    },
    inspectWork: {
      ...inspectWorkSto,
      flow: inspectWorkFlow,
      resultContracts: [resultContracts.workInspected],
    },
  });

  tp.tasks({
    processWork: {
      ...test1ProcessWorkTask,
      stateDefinition: stateDefinitions.processWork,
      channel: channels.processWork,
      stos: {
        prepareWork: stos.prepareWork,
        inspectWork: stos.inspectWork,
      },
      defaultSto: stos.prepareWork,
      inputContracts: [inputContracts.prepareWork],
    },
  });
});
