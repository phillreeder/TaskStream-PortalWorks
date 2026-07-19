import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FLOW_PERMISSIONS,
  isFlowPermissionAllowed,
} from '../index.js';

const allowed = (authority: 'task' | 'edge' | 'process', scope: 'streamState' | 'taskState' | 'processState', permission: Parameters<typeof isFlowPermissionAllowed>[0]['permission']) =>
  isFlowPermissionAllowed({
    permissions: DEFAULT_FLOW_PERMISSIONS,
    authority,
    scope,
    permission,
  });

describe('TenantProcess Flow permissions', () => {
  it('uses permission-first matrices to resolve Flow authority bands', () => {
    expect(allowed('task', 'streamState', 'update-fields')).toBe(true);
    expect(allowed('task', 'taskState', 'update-fields')).toBe(true);
    expect(allowed('task', 'taskState', 'add-records')).toBe(false);
    expect(allowed('edge', 'taskState', 'add-records')).toBe(true);
    expect(allowed('process', 'processState', 'replace-collection')).toBe(true);
    expect(allowed('process', 'streamState', 'update-fields')).toBe(false);
  });
});
