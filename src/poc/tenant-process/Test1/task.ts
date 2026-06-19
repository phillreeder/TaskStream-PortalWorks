import { test1ProcessWorkChannelDefinition } from './channelDefinition.js';
import { IEBBETA_TEST1_TENANT_PROCESS_IDS } from './ids.js';
import { test1ProcessWorkStateDefinition } from './stateDefinition.js';
import { inspectWorkSto, prepareWorkSto } from './stos.js';

export const test1ProcessWorkTask = {
  id: IEBBETA_TEST1_TENANT_PROCESS_IDS.task,
  stateDefinition: test1ProcessWorkStateDefinition,
  channel: test1ProcessWorkChannelDefinition,
  stos: [prepareWorkSto, inspectWorkSto],
  defaultSto: prepareWorkSto,
};
