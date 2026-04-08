import type { TenantProcessSelector } from '../../../../../../domain/entities/execution.ts';

const defaultSelector: TenantProcessSelector = {
  name: 'taskstream.default.selector',
  description: 'Selects the default unit for deterministic initialization',
  select({ candidates }) {
    return [...candidates].sort((a, b) => a.key.localeCompare(b.key))[0];
  },
};

export const selectors: Record<string, TenantProcessSelector> = {
  default: defaultSelector,
};
