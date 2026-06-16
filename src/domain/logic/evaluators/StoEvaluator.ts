import type {
  StateTransitionOperation,
  StoEvaluationResult,
  StreamState,
  TenantProcessRuntime,
} from '../../entities/execution.js';
import type { TenantProcessSelector } from '../../tenantProcess/index.js';

export interface StoEvaluationInput {
  readonly streamState: StreamState;
  readonly tenantProcess: TenantProcessRuntime;
}

export function evaluateStos(input: StoEvaluationInput): StoEvaluationResult {
  const rejected = Object.values(input.tenantProcess.stos)
    .filter((sto) => !(sto.flowKey in input.tenantProcess.flows))
    .map((sto) => ({ sto, reason: `Flow ${sto.flowKey} was not found for STO ${sto.key}` }));

  const candidates = Object.values(input.tenantProcess.stos)
    .filter((sto) => sto.flowKey in input.tenantProcess.flows)
    .sort((a, b) => a.key.localeCompare(b.key));

  return { candidates, rejected };
}

export interface SelectDeterministicStoInput {
  readonly context: {
    readonly streamState: StreamState;
    readonly tenantProcess: TenantProcessRuntime;
    readonly candidates: readonly StateTransitionOperation[];
  };
  readonly selector?: TenantProcessSelector<StateTransitionOperation>;
}

export function selectDeterministicSto(input: SelectDeterministicStoInput): StateTransitionOperation {
  const selected = input.selector?.select({
    candidates: input.context.candidates,
    state: input.context.streamState.data,
  });

  if (selected) {
    return selected;
  }

  const [first] = [...input.context.candidates].sort((a, b) => a.key.localeCompare(b.key));
  if (!first) {
    throw new Error('Cannot select STO because no candidates were provided');
  }
  return first;
}
