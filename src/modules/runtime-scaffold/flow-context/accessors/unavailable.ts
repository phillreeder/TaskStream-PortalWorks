import type { FlowAccessorResult } from '../../../../domain/tenantProcess/accessors/index.js';

export function unavailableAccessorResult(accessor: string, operation: string): FlowAccessorResult<never> {
  return {
    status: 'unavailable',
    reason: `${accessor}.${operation} is not available in this execution runtime`,
  };
}
