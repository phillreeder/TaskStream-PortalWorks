import { MODULE_LINK_TRACE_EVENTS } from './moduleLink.js';
import { RUNTIME_SCAFFOLD_TRACE_EVENTS } from './runtimeScaffold.js';
import { SHARED_TRACE_EVENTS } from './shared.js';
import { STREAM_STATE_TRACE_EVENTS } from './streamState.js';
import { SYSTEM_TRACE_EVENTS } from './systemTrace.js';
import { TENANT_PROCESS_TRACE_EVENTS } from './tenantProcess.js';

export * from './moduleLink.js';
export * from './runtimeScaffold.js';
export * from './shared.js';
export * from './streamState.js';
export * from './systemTrace.js';
export * from './tenantProcess.js';

export const TRACE_EVENTS = {
  shared: SHARED_TRACE_EVENTS,
  runtimeScaffold: RUNTIME_SCAFFOLD_TRACE_EVENTS,
  systemTrace: SYSTEM_TRACE_EVENTS,
  moduleLink: MODULE_LINK_TRACE_EVENTS,
  streamState: STREAM_STATE_TRACE_EVENTS,
  tenantProcess: TENANT_PROCESS_TRACE_EVENTS,
} as const;

export type TraceEventCatalog = typeof TRACE_EVENTS;
export type TraceEventCatalogNode = string | { readonly [key: string]: TraceEventCatalogNode };

export interface TraceEventCatalogEntry {
  readonly owner: string;
  readonly path: readonly string[];
  readonly name: string;
  readonly value: string;
}

export interface TraceEventDuplicateValue {
  readonly value: string;
  readonly entries: readonly TraceEventCatalogEntry[];
}

export interface TraceEventCatalogValidationResult {
  readonly ok: boolean;
  readonly eventCount: number;
  readonly duplicateValues: readonly TraceEventDuplicateValue[];
}

export interface TraceEventCatalogSummary extends TraceEventCatalogValidationResult {
  readonly owners: readonly string[];
  readonly entries: readonly TraceEventCatalogEntry[];
}

export interface TraceEventSelector {
  readonly operation: string;
  readonly phase?: string;
}

export interface TraceEventSelectableRecord {
  readonly operation?: string;
  readonly phase?: string;
  readonly seq?: number;
}

export type TraceEventOrderProofResult =
  | {
      readonly ok: true;
      readonly before: TraceEventOrderProofMatch;
      readonly after: TraceEventOrderProofMatch;
      readonly deltaSeq: number;
    }
  | {
      readonly ok: false;
      readonly reason: string;
      readonly before?: TraceEventOrderProofMatch;
      readonly after?: TraceEventOrderProofMatch;
    };

export interface TraceEventOrderProofMatch {
  readonly operation: string;
  readonly phase?: string;
  readonly seq: number;
}

export function collectTraceEventCatalogEntries(
  catalog: Readonly<Record<string, TraceEventCatalogNode>> = TRACE_EVENTS,
): readonly TraceEventCatalogEntry[] {
  return Object.entries(catalog).flatMap(([owner, node]) => collectNodeEntries(owner, [], node));
}

export function validateTraceEventCatalogUniqueValues(
  catalog: Readonly<Record<string, TraceEventCatalogNode>> = TRACE_EVENTS,
): TraceEventCatalogValidationResult {
  const entries = collectTraceEventCatalogEntries(catalog);
  const entriesByValue = new Map<string, TraceEventCatalogEntry[]>();

  for (const entry of entries) {
    entriesByValue.set(entry.value, [...(entriesByValue.get(entry.value) ?? []), entry]);
  }

  const duplicateValues = [...entriesByValue.entries()]
    .filter(([, groupedEntries]) => groupedEntries.length > 1)
    .map(([value, groupedEntries]) => ({
      value,
      entries: groupedEntries,
    }));

  return {
    ok: duplicateValues.length === 0,
    eventCount: entries.length,
    duplicateValues,
  };
}

export function createTraceEventCatalogSummary(
  catalog: Readonly<Record<string, TraceEventCatalogNode>> = TRACE_EVENTS,
): TraceEventCatalogSummary {
  const entries = collectTraceEventCatalogEntries(catalog);
  const validation = validateTraceEventCatalogUniqueValues(catalog);
  return {
    ...validation,
    owners: Object.keys(catalog).sort(),
    entries,
  };
}

export function matchesTraceEventSelector(record: TraceEventSelectableRecord, selector: TraceEventSelector): boolean {
  return record.operation === selector.operation && (selector.phase === undefined || record.phase === selector.phase);
}

export function proveTraceEventOrderBySeq(
  records: readonly TraceEventSelectableRecord[],
  beforeSelector: TraceEventSelector,
  afterSelector: TraceEventSelector,
): TraceEventOrderProofResult {
  const before = findFirstMatch(records, beforeSelector);
  const after = findFirstMatch(records, afterSelector);

  if (!before || !after) {
    return {
      ok: false,
      reason: 'missing selector match',
      ...(before ? { before } : {}),
      ...(after ? { after } : {}),
    };
  }

  if (before.seq >= after.seq) {
    return {
      ok: false,
      reason: 'selector order is not increasing by seq',
      before,
      after,
    };
  }

  return {
    ok: true,
    before,
    after,
    deltaSeq: after.seq - before.seq,
  };
}

function collectNodeEntries(owner: string, path: readonly string[], node: TraceEventCatalogNode): readonly TraceEventCatalogEntry[] {
  if (typeof node === 'string') {
    return [
      {
        owner,
        path,
        name: path.join('.'),
        value: node,
      },
    ];
  }

  return Object.entries(node).flatMap(([key, child]) => collectNodeEntries(owner, [...path, key], child));
}

function findFirstMatch(
  records: readonly TraceEventSelectableRecord[],
  selector: TraceEventSelector,
): TraceEventOrderProofMatch | undefined {
  const record = records.find((entry) => Number.isInteger(entry.seq) && matchesTraceEventSelector(entry, selector));
  if (!record || typeof record.seq !== 'number' || !Number.isInteger(record.seq)) {
    return undefined;
  }

  return {
    operation: selector.operation,
    ...(selector.phase ? { phase: selector.phase } : {}),
    seq: record.seq,
  };
}
