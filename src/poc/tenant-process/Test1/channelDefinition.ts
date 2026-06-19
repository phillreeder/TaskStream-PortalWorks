import { test1ProcessWorkChannel } from './channels.js';
import { IEBBETA_TEST1_TENANT_PROCESS_IDS } from './ids.js';

export const test1ProcessWorkChannelDefinition = {
  id: IEBBETA_TEST1_TENANT_PROCESS_IDS.channel,
  executable: test1ProcessWorkChannel,
};
