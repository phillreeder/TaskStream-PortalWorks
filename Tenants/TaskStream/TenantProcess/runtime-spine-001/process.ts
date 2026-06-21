import { RUNTIME_SPINE_TENANT_PROCESS_IDS } from './ids.js';
import { reviewSubmissionTask } from './task.js';

// This is the authored TenantProcess graph. Domain types and runtime
// registration will be updated separately to normalize these definitions
// into ID-based registries for persistence, transport, and lookup.
export const runtimeSpineTenantProcess = {
  id: RUNTIME_SPINE_TENANT_PROCESS_IDS.tenantProcess,
  tenantId: RUNTIME_SPINE_TENANT_PROCESS_IDS.tenant,
  processId: RUNTIME_SPINE_TENANT_PROCESS_IDS.process,
  version: 1,

  name: 'Runtime Spine 001',
  description: 'Feature-coverage TenantProcess wrapper for proving StateDefinition, Channel, STO, Flow, and contract registration.',

  tasks: [reviewSubmissionTask],
};
