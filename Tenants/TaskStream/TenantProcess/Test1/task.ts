import { activateProcessWorkFlow } from './flows.js';

export const test1ProcessWorkTask = {
  activationFlow: activateProcessWorkFlow,
  stateDefinition: 'processWork',
  channel: 'processWork',
  stos: ['prepareWork', 'inspectWork'],
  defaultSto: 'prepareWork',
  inputContracts: ['prepareWork'],
} as const;
