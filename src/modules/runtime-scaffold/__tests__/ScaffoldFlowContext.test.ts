import { describe, expect, it, vi } from 'vitest';
import { defineState, StateContainer } from '../../../definitionRuntime/state/index.js';
import { createScaffoldFlowContext } from '../ScaffoldFlowContext.js';
import type { RuntimeScaffoldFlowSelection } from '../RuntimeScaffoldPipelineTypes.js';

const stateDefinition = defineState({
  fields: {
    status: { type: 'string', default: 'idle' },
  },
});

const selection = {
  task: { taskId: 'task', stateDefinition, stos: [] },
  sto: { stoId: 'sto' },
  flow: { flowId: 'flow', executable: () => ({ status: 'succeeded' }) },
} satisfies RuntimeScaffoldFlowSelection;

describe('createScaffoldFlowContext', () => {
  it('types and caches boolean probes by name for one flow execution', () => {
    const context = createScaffoldFlowContext(selection, new StateContainer({ definition: stateDefinition }));
    const evaluate = vi.fn(() => true);

    expect(context.probe('is-ready', evaluate)).toBe(true);
    expect(context.probe('is-ready', evaluate)).toBe(true);
    expect(evaluate).toHaveBeenCalledTimes(1);
  });

  it('constructs consistent success and failure results', () => {
    const context = createScaffoldFlowContext(selection, new StateContainer({ definition: stateDefinition }));

    expect(context.success({ value: 1 }, { metadata: { source: 'test' } })).toEqual({
      status: 'succeeded',
      result: { value: 1 },
      metadata: { source: 'test' },
    });

    expect(context.fail({ reason: 'nope' })).toEqual({
      status: 'failed',
      reason: 'nope',
    });

    expect(context.fail()).toEqual({
      status: 'failed',
    });
  });

  it('constructs guarded retry outcomes in seconds', () => {
    const context = createScaffoldFlowContext(selection, new StateContainer({ definition: stateDefinition }));

    expect(context.retry({ reason: 'dependency-unavailable' })).toEqual({
      status: 'retry',
      reason: 'dependency-unavailable',
      afterSeconds: 60,
    });

    expect(context.retry({ afterSeconds: 10, allowFastRetry: true })).toEqual({
      status: 'retry',
      afterSeconds: 10,
      allowFastRetry: true,
    });

    expect(() => context.retry({ afterSeconds: 10 })).toThrow(
      'Retry delay below 60 seconds requires allowFastRetry: true',
    );
    expect(() => context.retry({ afterSeconds: 1.5, allowFastRetry: true })).toThrow(
      'Retry delay must be a positive whole number of seconds',
    );
  });
});
