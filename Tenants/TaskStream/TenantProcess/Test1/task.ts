import { activateProcessWorkFlow } from './flows.js';

export const test1ProcessWorkTask = {
  activationFlow: {
    flowId: 'activateProcessWork',
    executable: activateProcessWorkFlow,
  },
  stateDefinition: 'processWork',
  channel: 'processWork',
  stos: ['prepareWork', 'inspectWork'],
  defaultSto: 'prepareWork',
  inputContracts: ['prepareWork'],
} as const;
