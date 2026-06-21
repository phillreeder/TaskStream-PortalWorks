import { test1ProcessWorkChannel } from './channels.js';
import { prepareWorkInputContract } from './contracts.js';
import { test1ProcessWorkStateDefinition } from './stateDefinition.js';
import { inspectWorkSto, prepareWorkSto } from './stos.js';

export const test1ProcessWorkTask = {
  stateDefinition: test1ProcessWorkStateDefinition,
  channel: test1ProcessWorkChannel,
  stos: {
    prepareWork: prepareWorkSto,
    inspectWork: inspectWorkSto,
  },
  defaultSto: prepareWorkSto,
  inputContracts: [prepareWorkInputContract],
};
