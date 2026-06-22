export interface ExecutionWorkerServiceConfig {
  readonly poolId: string;
  readonly concurrency: number;
  readonly pollIntervalMs: number;
}

export function loadExecutionWorkerServiceConfig(
  environment: NodeJS.ProcessEnv = process.env,
): ExecutionWorkerServiceConfig {
  return {
    poolId: environment.EXECUTION_WORKER_POOL_ID?.trim() || 'execution.default',
    concurrency: readPositiveInteger(environment.EXECUTION_WORKER_CONCURRENCY, 1, 'EXECUTION_WORKER_CONCURRENCY'),
    pollIntervalMs: readPositiveInteger(environment.EXECUTION_WORKER_POLL_INTERVAL_MS, 250, 'EXECUTION_WORKER_POLL_INTERVAL_MS'),
  };
}

function readPositiveInteger(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}
