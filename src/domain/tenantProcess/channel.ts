import type { ChannelExecutable } from './types.js';

/**
 * Defines a TenantProcess Channel while preserving the canonical contextual
 * typing boundary for synchronous STO selection.
 *
 * STO selection is provided by the runtime through ctx.selectSto(...), so
 * authored Channels do not import STO definitions or selection libraries.
 */
export function channel(executable: ChannelExecutable): ChannelExecutable {
  return executable;
}
