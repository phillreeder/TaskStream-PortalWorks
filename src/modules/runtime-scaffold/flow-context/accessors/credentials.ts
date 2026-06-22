import type { FlowCredentialsAccessor } from '../../../../domain/tenantProcess/accessors/index.js';
import { unavailableAccessorResult } from './unavailable.js';

export function loadScaffoldCredentialsAccessor(): FlowCredentialsAccessor {
  return {
    async get() { return unavailableAccessorResult('credentials', 'get'); },
  };
}
