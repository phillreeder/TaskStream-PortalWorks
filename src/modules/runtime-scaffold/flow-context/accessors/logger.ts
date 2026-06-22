import type { FlowLoggerAccessor } from '../../../../domain/tenantProcess/accessors/index.js';
import { unavailableAccessorResult } from './unavailable.js';

export function loadScaffoldLoggerAccessor(): FlowLoggerAccessor {
  return {
    async debug() { return unavailableAccessorResult('logger', 'debug'); },
    async info() { return unavailableAccessorResult('logger', 'info'); },
    async warn() { return unavailableAccessorResult('logger', 'warn'); },
    async error() { return unavailableAccessorResult('logger', 'error'); },
  };
}
