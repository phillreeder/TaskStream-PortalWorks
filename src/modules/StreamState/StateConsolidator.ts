import { StreamStateModuleError } from './errors.js';
import { applySet, applyUnset } from './path.js';
import type { JsonObject, ResolvedStreamState, StateConsolidationInput, VerifiedStateChange } from './types.js';

export class StateConsolidator {
  consolidate(input: StateConsolidationInput): ResolvedStreamState {
    const blockedPathKeys = new Set((input.dependencyBlocks ?? []).map((block) => block.path.map(String).join('.')));
    const blockedChangeIds: string[] = [];
    const appliedPendingChangeIds: string[] = [];

    let state = input.authoritativeState.state;
    for (const change of dedupeAndSort(input.pendingChanges)) {
      const key = change.path.map(String).join('.');
      if (blockedPathKeys.has(key)) {
        blockedChangeIds.push(change.changeId);
        continue;
      }
      state = applyChange(state, change);
      appliedPendingChangeIds.push(change.changeId);
    }

    return {
      streamKey: input.authoritativeState.streamKey,
      authoritativeVersion: input.authoritativeState.version,
      effectiveVersion: input.authoritativeState.version + appliedPendingChangeIds.length,
      state,
      appliedPendingChangeIds,
      blockedChangeIds,
      dependencyBlocks: input.dependencyBlocks ?? [],
    };
  }
}

function applyChange(state: JsonObject, change: VerifiedStateChange): JsonObject {
  switch (change.operation) {
    case 'set':
    case 'merge':
      return applySet(state, change.path, change.value ?? null);
    case 'unset':
      return applyUnset(state, change.path);
    case 'append':
    case 'increment':
      throw new StreamStateModuleError(
        `Operation ${change.operation} is declared but not implemented in the initial scaffold`,
        'UNSUPPORTED_CHANGE_OPERATION',
      );
  }
}

function dedupeAndSort(changes: readonly VerifiedStateChange[]): VerifiedStateChange[] {
  const byId = new Map<string, VerifiedStateChange>();
  for (const change of changes) {
    byId.set(change.changeId, change);
  }
  return [...byId.values()].sort((left, right) => {
    if (left.order !== right.order) {
      return left.order - right.order;
    }
    return left.changeId.localeCompare(right.changeId);
  });
}
