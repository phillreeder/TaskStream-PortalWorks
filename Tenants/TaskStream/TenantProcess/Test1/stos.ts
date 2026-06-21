export const prepareWorkSto = {
  flow: 'prepareWork',
  inputContracts: ['prepareWork'],
  resultContracts: ['workPrepared'],
} as const;

export const inspectWorkSto = {
  flow: 'inspectWork',
  resultContracts: ['workInspected'],
} as const;
