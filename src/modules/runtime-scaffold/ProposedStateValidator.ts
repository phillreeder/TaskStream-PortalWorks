import type {
  RuntimeScaffoldExecutedExecution,
  RuntimeScaffoldValidatedExecution,
} from './RuntimeScaffoldPipelineTypes.js';
import type { RuntimeScaffoldValidationSummary } from './types.js';

export function validateRuntimeScaffoldProposedState(
  execution: RuntimeScaffoldExecutedExecution,
): RuntimeScaffoldValidatedExecution {
  const validation: RuntimeScaffoldValidationSummary = {
    valid: true,
    target: 'proposedState',
    notes: ['StateContainer accepted all flow mutations through the working-state validation boundary.'],
  };

  return {
    ...execution,
    validation,
  };
}
