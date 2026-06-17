import type { ChannelExecutable } from './types.js';

/**
 * Defines a TenantProcess Channel while providing the canonical contextual
 * typing boundary for `(ctx) => ChannelSTORequest`.
 *
 * Runtime context construction and execution remain outside the domain
 * definition helper. The planning system supplies the context later.
 */
export function channel(executable: ChannelExecutable): ChannelExecutable {
  return executable;
}
