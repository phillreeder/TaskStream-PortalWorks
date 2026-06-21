import { reviewSubmissionChannel } from './channels.js';
import { RUNTIME_SPINE_TENANT_PROCESS_IDS } from './ids.js';

export const reviewSubmissionChannelDefinition = {
  id: RUNTIME_SPINE_TENANT_PROCESS_IDS.channel,
  executable: reviewSubmissionChannel,
};
