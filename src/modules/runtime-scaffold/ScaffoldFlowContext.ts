import { StateReader, StateWriter } from '../../definitionRuntime/state/index.js';
import type {
  StateContainer,
  StatePathInput,
  StatePathValueInput,
} from '../../definitionRuntime/state/index.js';
import type { FlowChangeWriter, FlowContext } from '../../domain/tenantProcess/index.js';
import type { RuntimeScaffoldFlowSelection } from './RuntimeScaffoldPipelineTypes.js';
import { loadScaffoldArtifactAccessor } from './flow-context/accessors/artifact.js';
import { loadScaffoldCredentialsAccessor } from './flow-context/accessors/credentials.js';
import { loadScaffoldHttpAccessor } from './flow-context/accessors/http.js';
import { loadScaffoldLoggerAccessor } from './flow-context/accessors/logger.js';
import { loadScaffoldUnitAccessor } from './flow-context/accessors/unit.js';

export function createScaffoldFlowContext(
  selection: RuntimeScaffoldFlowSelection,
  container: StateContainer,
): FlowContext {
  const stateReader = new StateReader({ container });
  const stateWriter = new StateWriter({ container });
  const probeResults = new Map<string, boolean>();
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
    artifact: loadScaffoldArtifactAccessor(),
    credentials: loadScaffoldCredentialsAccessor(),
    logger: loadScaffoldLoggerAccessor(),
    unit: loadScaffoldUnitAccessor(),
    http: loadScaffoldHttpAccessor(),
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
