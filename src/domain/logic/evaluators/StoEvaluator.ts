import type {
  StateDefinition,
  StateTransitionOperation,
  StoRejection,
  StoSelectionContext,
  TenantProcessRuntime,
  TenantProcessSelector,
  StreamState,
} from '../../entities/execution.ts';

export interface EvaluateStosOptions {
  readonly streamState: StreamState;
  readonly tenantProcess: TenantProcessRuntime;
}

export interface StoEvaluationResult {
  readonly candidates: readonly StateTransitionOperation[];
  readonly rejected: readonly StoRejection[];
}

export type StoSelectionErrorCode = 'NO_CANDIDATES' | 'INVALID_SELECTION';

export class StoSelectionError extends Error {
  constructor(message: string, public readonly code: StoSelectionErrorCode, options?: ErrorOptions) {
    super(message, options);
    this.name = 'StoSelectionError';
  }
}

const buildRejection = (sto: StateTransitionOperation, reason: string): StoRejection => ({ sto, reason });

const getApplicabilityRule = (definition: StateDefinition, sto: StateTransitionOperation) =>
  definition.stos?.[sto.key];

export const evaluateStos = ({ streamState, tenantProcess }: EvaluateStosOptions): StoEvaluationResult => {
  const candidates: StateTransitionOperation[] = [];
  const rejected: StoRejection[] = [];
  const stos = Array.from(tenantProcess.stos.values());

  for (const sto of stos) {
    const rule = getApplicabilityRule(tenantProcess.stateDefinition, sto);
    if (rule && !rule.when(streamState.data, sto)) {
      rejected.push(buildRejection(sto, rule.errorMessage ?? 'STO is not applicable to the current state'));
      continue;
    }
    candidates.push(sto);
  }

  return { candidates, rejected };
};

export interface SelectStoOptions {
  readonly context: StoSelectionContext;
  readonly selector?: TenantProcessSelector;
}

const fallbackDeterministicSelector = (candidates: readonly StateTransitionOperation[]): StateTransitionOperation => {
  const [first] = [...candidates].sort((a, b) => a.key.localeCompare(b.key));
  return first;
};

export const selectDeterministicSto = ({ context, selector }: SelectStoOptions): StateTransitionOperation => {
  const { candidates } = context;
  if (candidates.length === 0) {
    throw new StoSelectionError('No STO candidates were provided', 'NO_CANDIDATES');
  }
  if (candidates.length === 1) {
    return candidates[0];
  }

  const resolved = selector?.select(context) ?? fallbackDeterministicSelector(candidates);
  const located = candidates.find((candidate) => candidate.key === resolved?.key);
  if (!located) {
    throw new StoSelectionError('Selector produced an invalid STO candidate', 'INVALID_SELECTION');
  }
  return located;
};
