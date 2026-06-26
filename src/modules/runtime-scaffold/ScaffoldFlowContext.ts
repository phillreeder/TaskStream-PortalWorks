import { StateReader, StateWriter } from '../../definitionRuntime/state/index.js';
import type {
  StateContainer,
  StatePathInput,
  StatePathValueInput,
} from '../../definitionRuntime/state/index.js';
import type {
  FlowArtifactAccessor,
  FlowChangeWriter,
  FlowContext,
  FlowCredentialsAccessor,
  FlowExecutionBinding,
  FlowHttpAccessor,
  FlowLoggerAccessor,
  FlowUnitAccessor,
} from '../../domain/tenantProcess/index.js';
import type { RuntimeScaffoldFlowSelection } from './RuntimeScaffoldPipelineTypes.js';
import { loadScaffoldArtifactAccessor } from './flow-context/accessors/artifact.js';
import { loadScaffoldCredentialsAccessor } from './flow-context/accessors/credentials.js';
import { loadScaffoldHttpAccessor } from './flow-context/accessors/http.js';
import { loadScaffoldLoggerAccessor } from './flow-context/accessors/logger.js';
import { loadScaffoldUnitAccessor } from './flow-context/accessors/unit.js';

export interface ScaffoldFlowContextAccessors {
  readonly artifact?: FlowArtifactAccessor;
  readonly credentials?: FlowCredentialsAccessor;
  readonly logger?: FlowLoggerAccessor;
  readonly unit?: FlowUnitAccessor;
  readonly http?: FlowHttpAccessor;
}

export interface ScaffoldFlowContextExecutionInput {
  readonly taskRef: string;
  readonly binding: FlowExecutionBinding;
  readonly container: StateContainer;
  readonly accessors?: ScaffoldFlowContextAccessors;
}

export function createScaffoldFlowContext(
  selection: RuntimeScaffoldFlowSelection,
  container: StateContainer,
): FlowContext {
  return createScaffoldFlowContextForExecution({
    taskRef: selection.task.taskId,
    binding: {
      kind: 'stream-flow',
      stoRef: selection.sto.stoId,
      flowRef: selection.flow.flowId,
    },
    container,
  });
}

export function createScaffoldFlowContextForExecution(
  input: ScaffoldFlowContextExecutionInput,
): FlowContext {
  const stateReader = new StateReader({ container: input.container });
  const stateWriter = new StateWriter({ container: input.container });
  const probeResults = new Map<string, boolean>();
  const change = {
    set(value: StatePathValueInput, options?: Parameters<FlowChangeWriter['set']>[1]) {
      return stateWriter.set_path(value, options as any) as ReturnType<FlowChangeWriter['set']>;
    },
  } as FlowChangeWriter;

  const accessors = input.accessors ?? {};

  return {
    taskRef: input.taskRef,
    ...(input.binding.kind === 'stream-flow' ? { stoRef: input.binding.stoRef } : {}),
    execution: input.binding,
    state: {
      get(value: StatePathInput) {
        return stateReader.get(value);
      },
      snapshot() {
        return input.container.snapshot();
      },
    },
    change,
    artifact: accessors.artifact ?? loadScaffoldArtifactAccessor(),
    credentials: accessors.credentials ?? loadScaffoldCredentialsAccessor(),
    logger: accessors.logger ?? loadScaffoldLoggerAccessor(),
    unit: accessors.unit ?? loadScaffoldUnitAccessor(),
    http: accessors.http ?? loadScaffoldHttpAccessor(),
    probe(name, evaluate) {
      const cached = probeResults.get(name);
      if (cached !== undefined) {
        return cached;
      }

      const result = evaluate();
      probeResults.set(name, result);
      return result;
    },
    success(result, options = {}) {
      return {
        status: 'succeeded',
        ...(result === undefined ? {} : { result }),
        ...options,
      };
    },
    retry(options = {}) {
      const afterSeconds = options.afterSeconds ?? 60;

      if (!Number.isFinite(afterSeconds) || !Number.isInteger(afterSeconds) || afterSeconds <= 0) {
        throw new RangeError('Retry delay must be a positive whole number of seconds');
      }

      if (afterSeconds < 60 && options.allowFastRetry !== true) {
        throw new RangeError('Retry delay below 60 seconds requires allowFastRetry: true');
      }

      return {
        status: 'retry',
        afterSeconds,
        ...(options.reason === undefined ? {} : { reason: options.reason }),
        ...(options.allowFastRetry === true ? { allowFastRetry: true } : {}),
      };
    },
    fail(options = {}) {
      return {
        status: 'failed',
        ...(options.reason === undefined ? {} : { reason: options.reason }),
      };
    },
  };
}
