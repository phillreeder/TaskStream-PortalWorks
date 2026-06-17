import { StateContainer } from '../../definitionRuntime/state/index.js';
import type { StateDefinition } from '../../definitionRuntime/state/index.js';
import { RuntimeScaffoldExecutionError } from './errors.js';
import { cloneJson } from './json.js';
import type { RuntimeScaffoldWorkingState } from './RuntimeScaffoldPipelineTypes.js';

export function prepareRuntimeScaffoldWorkingState(
  stateDefinition: StateDefinition,
  sourceState: unknown,
): RuntimeScaffoldWorkingState {
  try {
    const previousState = cloneJson(sourceState);
    const container = new StateContainer({
      definition: stateDefinition,
      state: previousState as any,
    });
    return {
      previousState,
      container,
    };
  } catch (error) {
    throw new RuntimeScaffoldExecutionError({
      message: 'Unable to prepare isolated RuntimeScaffold working state',
      code: 'SOURCE_STATE_INVALID',
      phase: 'state-preparation',
      cause: error,
    });
  }
}
