import type { FlowExecutable } from './types.js';

/**
 * Defines a TenantProcess Flow while providing the canonical contextual
 * typing boundary for `(ctx, input)`.
 *
 * Runtime context construction and execution remain outside the domain
 * definition helper. The execution system supplies both arguments later.
 */
export function flow(executable: FlowExecutable): FlowExecutable {
  return executable;
}
