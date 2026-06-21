export const test1ProcessWorkTask = {
  stateDefinition: 'processWork',
  channel: 'processWork',
  stos: ['prepareWork', 'inspectWork'],
  defaultSto: 'prepareWork',
  inputContracts: ['prepareWork'],
} as const;
