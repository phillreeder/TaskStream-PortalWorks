import { describe, expect, it } from 'vitest';
import { flow } from '../flow.js';

describe('flow', () => {
  it('preserves the executable supplied to the definition provider', () => {
    const executable = (ctx: any, input: any) => ({
      status: 'succeeded',
      result: {
        taskRef: ctx.taskRef,
        value: input.value,
      },
    });

    expect(flow(executable)).toBe(executable);
  });
});
