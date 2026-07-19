import type {
  FlowAuthority,
  FlowPermission,
  FlowPermissionMatrix,
  FlowStateScope,
} from './types.js';

export const FLOW_AUTHORITIES = ['task', 'edge', 'process'] as const satisfies readonly FlowAuthority[];

export const FLOW_PERMISSIONS = [
  'read',
  'update-fields',
  'add-records',
  'remove-records',
  'replace-collection',
  'set-lifecycle',
  'create-stream',
  'close-stream',
  'activate-task',
  'complete-task',
  'promote-task',
] as const satisfies readonly FlowPermission[];

export const FLOW_STATE_SCOPES = [
  'streamState',
  'taskState',
  'processState',
] as const satisfies readonly FlowStateScope[];

export function defineFlowPermissions<T extends FlowPermissionMatrix>(permissions: T): T {
  return permissions;
}


export const DEFAULT_FLOW_PERMISSIONS = defineFlowPermissions({
  streamState: {
    read: ['task', 'edge', 'process'],
    'update-fields': ['task', 'edge'],
    'set-lifecycle': ['task', 'edge'],
    'create-stream': ['edge'],
    'close-stream': ['edge'],
  },
  taskState: {
    read: ['task', 'edge', 'process'],
    'update-fields': ['task', 'edge'],
    'add-records': ['edge'],
    'remove-records': ['edge'],
    'replace-collection': ['edge'],
    'set-lifecycle': ['edge'],
    'activate-task': ['process'],
    'complete-task': ['edge', 'process'],
    'promote-task': ['process'],
  },
  processState: {
    read: ['task', 'edge', 'process'],
    'update-fields': ['edge', 'process'],
    'add-records': ['process'],
    'remove-records': ['process'],
    'replace-collection': ['process'],
    'set-lifecycle': ['process'],
  },
} as const);

export function isFlowPermissionAllowed(input: {
  readonly permissions: FlowPermissionMatrix;
  readonly authority: FlowAuthority;
  readonly scope: FlowStateScope;
  readonly permission: FlowPermission;
}): boolean {
  return input.permissions[input.scope][input.permission]?.includes(input.authority) === true;
}

export function assertFlowPermission(input: {
  readonly permissions: FlowPermissionMatrix;
  readonly authority: FlowAuthority;
  readonly scope: FlowStateScope;
  readonly permission: FlowPermission;
  readonly flowRef?: string;
}): void {
  if (isFlowPermissionAllowed(input)) return;

  const flow = input.flowRef ? `Flow ${input.flowRef}` : `Flow authority ${input.authority}`;
  throw new Error(
    `${flow} is not permitted to use ${input.permission} on ${input.scope}`,
  );
}
