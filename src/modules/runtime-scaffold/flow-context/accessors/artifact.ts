import type { FlowArtifactAccessor } from '../../../../domain/tenantProcess/accessors/index.js';
import { unavailableAccessorResult } from './unavailable.js';

export function loadScaffoldArtifactAccessor(): FlowArtifactAccessor {
  return {
    async save() { return unavailableAccessorResult('artifact', 'save'); },
    async get() { return unavailableAccessorResult('artifact', 'get'); },
    async list() { return unavailableAccessorResult('artifact', 'list'); },
  };
}
