export class ExecutionError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class ExecutionDataLoaderError extends ExecutionError {
  constructor(message: string, public readonly code: string, options?: ErrorOptions) {
    super(message, options);
  }
}

export class ExecutionGuardError extends ExecutionError {}

export interface FailedStepContext {
  readonly actionKey: string;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly error: Error;
}

export class ActionExecutionError extends ExecutionError {
  constructor(message: string, public readonly steps: readonly FailedStepContext[], options?: ErrorOptions) {
    super(message, options);
  }
}

export class StoResultVerificationError extends ExecutionError {
  constructor(
    message: string,
    public readonly errors: readonly string[] = [],
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

export class RunExecutionError extends ExecutionError {
  constructor(message: string, public readonly stage: 'validate' | 'execute' | 'verify' | 'finalize', options?: ErrorOptions) {
    super(message, options);
  }
}
