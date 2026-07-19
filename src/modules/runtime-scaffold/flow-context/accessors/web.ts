import type { FlowWebAccessor } from '../../../../domain/tenantProcess/accessors/index.js';
import { unavailableAccessorResult } from './unavailable.js';

export function loadScaffoldWebAccessor(): FlowWebAccessor {
  return {
    navigate: async () => unavailableAccessorResult('web', 'navigate'),
    capture: async () => unavailableAccessorResult('web', 'capture'),
  };
}
