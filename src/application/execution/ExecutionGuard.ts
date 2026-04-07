import type { ExecutionContext } from '../../domain/contracts/executionContext.ts';
import type { ExecutionSnapshot } from '../../domain/entities/execution.ts';
import { ExecutionGuardError } from './errors.js';

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object';

const isDeepFrozen = (value: unknown, seen: WeakSet<object> = new WeakSet()): boolean => {
  if (!isObject(value)) {
    return true;
  }
  if (seen.has(value)) {
    return true;
  }
  seen.add(value);
  if (!Object.isFrozen(value)) {
    return false;
  }
  for (const child of Object.values(value)) {
    if (!isDeepFrozen(child, seen)) {
      return false;
    }
  }
  return true;
};

export class ExecutionGuard {
  constructor(private readonly snapshot: ExecutionSnapshot) {}

  ensureExecutionPhase(): void {
    if (this.snapshot.sto.phase !== 'execution') {
      throw new ExecutionGuardError(`STO ${this.snapshot.sto.key} belongs to phase ${this.snapshot.sto.phase}`);
    }
  }

  ensureSnapshotIntegrity(): void {
    if (!isDeepFrozen(this.snapshot)) {
      throw new ExecutionGuardError('Execution snapshot must be immutable before execution');
    }
  }

  ensureStateWriterPristine(ctx: ExecutionContext): void {
    if (ctx.stateWriter.isDirty()) {
      throw new ExecutionGuardError('State writer must not contain pending changes before execution');
    }
  }

  ensureStateWriterFlushed(ctx: ExecutionContext): void {
    if (ctx.stateWriter.isDirty()) {
      throw new ExecutionGuardError('All state mutations must be flushed before finalizing execution');
    }
  }
}
