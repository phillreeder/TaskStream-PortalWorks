import type { ExecutionCompletionPublisher, ExecutionQueue } from '../../application/execution/index.js';
import { ModuleLink } from '../../modules/ModuleLink/index.js';
import type { FlowExecutor } from '../../modules/execution-engine/index.js';
import { ExecutionWorkerMicroservice } from './ExecutionWorkerMicroservice.js';
import {
  loadExecutionWorkerServiceConfig,
  type ExecutionWorkerServiceConfig,
} from './config.js';

export interface CreateExecutionWorkerMicroserviceOptions {
  readonly environment?: NodeJS.ProcessEnv;
  readonly config?: Partial<ExecutionWorkerServiceConfig>;
  readonly moduleLink?: ModuleLink;
  readonly queue?: ExecutionQueue;
  readonly flowExecutor?: FlowExecutor;
  readonly completionPublisher?: ExecutionCompletionPublisher;
}

export function createExecutionWorkerMicroservice(
  options: CreateExecutionWorkerMicroserviceOptions = {},
): ExecutionWorkerMicroservice {
  const environmentConfig = loadExecutionWorkerServiceConfig(options.environment);
  const config = { ...environmentConfig, ...options.config };

  return new ExecutionWorkerMicroservice({
    moduleLink: options.moduleLink,
    queue: options.queue,
    flowExecutor: options.flowExecutor,
    completionPublisher: options.completionPublisher,
    poolId: config.poolId,
    concurrency: config.concurrency,
    pollIntervalMs: config.pollIntervalMs,
  });
}
