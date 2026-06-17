import type { FlowResult } from '../../domain/tenantProcess/index.js';
import { RuntimeScaffoldExecutionError } from './errors.js';
import { createScaffoldFlowContext } from './ScaffoldFlowContext.js';
import type { RuntimeScaffoldFlowResolvedExecution } from './RuntimeScaffoldPipelineTypes.js';

export class ScaffoldFlowRunner {
  async run(input: RuntimeScaffoldFlowResolvedExecution): Promise<FlowResult> {
    const { flowSelection, workingState, descriptor } = input;
    try {
      return await flowSelection.flow.executable(
        createScaffoldFlowContext(flowSelection, workingState.container),
        (descriptor.execution?.input ?? {}) as Record<string, any>,
      );
    } catch (error) {
      throw new RuntimeScaffoldExecutionError({
        message: `RuntimeScaffold flowOnly Flow execution failed: ${flowSelection.flow.flowId}`,
        code: 'FLOW_EXECUTION_FAILED',
        phase: 'flow-execution',
        details: {
          taskId: flowSelection.task.taskId,
          stoId: flowSelection.sto.stoId,
          flowId: flowSelection.flow.flowId,
        },
        cause: error,
      });
    }
  }
}
