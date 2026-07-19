export const prepareWorkSto = {
  authority: 'task',
  flow: 'prepareWork',
  inputContracts: ['prepareWork'],
  resultContracts: ['workPrepared'],
} as const;

export const inspectWorkSto = {
  authority: 'task',
  flow: 'inspectWork',
  resultContracts: ['workInspected'],
} as const;
