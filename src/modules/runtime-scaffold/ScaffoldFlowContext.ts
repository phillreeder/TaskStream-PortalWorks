import { StateReader, StateWriter } from '../../definitionRuntime/state/index.js';
import type {
  StateContainer,
  StatePathInput,
  StatePathValueInput,
} from '../../definitionRuntime/state/index.js';
import type { FlowChangeWriter, FlowContext } from '../../domain/tenantProcess/index.js';
import type { RuntimeScaffoldFlowSelection } from './RuntimeScaffoldPipelineTypes.js';

export function createScaffoldFlowContext(
  selection: RuntimeScaffoldFlowSelection,
  container: StateContainer,
): FlowContext {
  const stateReader = new StateReader({ container });
  const stateWriter = new StateWriter({ container });
  const change = {
    set(input: StatePathValueInput, options?: Parameters<FlowChangeWriter['set']>[1]) {
      return stateWriter.set_path(input, options as any) as ReturnType<FlowChangeWriter['set']>;
    },
  } as FlowChangeWriter;

  return {
    taskRef: selection.task.taskId,
    stoRef: selection.sto.stoId,
    state: {
      get(input: StatePathInput) {
        return stateReader.get(input);
      },
      snapshot() {
        return container.snapshot();
      },
    },
    change,
  };
}
