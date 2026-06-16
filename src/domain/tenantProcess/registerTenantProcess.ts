import type { RegisteredTenantProcess, TenantProcessDefinition } from './types.js';
import { validateTenantProcessDefinition, validateTenantProcessRuntimeBinding } from './validateTenantProcess.js';

export interface RegisterTenantProcessInput {
  readonly definition: unknown;
  /**
   * Deprecated compatibility input. Canonical TenantProcess definitions own executable surfaces directly.
   */
  readonly binding?: unknown;
}

export function registerTenantProcess(input: RegisterTenantProcessInput): RegisteredTenantProcess {
  validateTenantProcessDefinition(input.definition);
  if (input.binding !== undefined) {
    validateTenantProcessRuntimeBinding(input.definition, input.binding);
  }

  return {
    definition: input.definition as TenantProcessDefinition,
  };
}
