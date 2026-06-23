import type { ExecutionWorkPublisher } from '../../application/planners/ExecutionWorkPublisher.js';
import { PlannerWorker } from '../../application/planners/PlannerWorker.js';
import { PlannerWorkerPool } from '../../application/planners/PlannerWorkerPool.js';
import { TaskStorageExecutionWorkPublisher } from '../../infrastructure/execution/TaskStorageExecutionWorkPublisher.js';
import { TenantProcessExplorer } from '../../infrastructure/tenant-process/TenantProcessExplorer.js';
import { TenantProcessLoader } from '../../infrastructure/tenant-process/TenantProcessLoader.js';
import { TenantProcessLoadParameterStore } from '../../infrastructure/tenant-process/TenantProcessLoadParameterStore.js';
import { SqliteTaskStorageGateway } from '../../infrastructure/task-storage/SqliteTaskStorageGateway.js';
import { SystemTraceRecorder } from '../../modules/SystemTrace/index.js';
import { SqlSystemTraceAdapter } from '../../modules/SystemTrace/sqlTracePersistence.js';
import { loadPlannerServiceConfig, type PlannerServiceConfig } from './config.js';
import { PlannerService } from './PlannerService.js';

export interface CreatePlannerServiceOptions {
  readonly environment?: NodeJS.ProcessEnv;
  readonly config?: Partial<PlannerServiceConfig>;
  readonly executionWorkPublisher?: ExecutionWorkPublisher;
  readonly workerIdFactory?: (index: number) => string;
  readonly onWorkerError?: (error: unknown, workerId: string) => void;
}

export async function createPlannerService(
  options: CreatePlannerServiceOptions = {},
): Promise<PlannerService> {
  const environmentConfig = loadPlannerServiceConfig(options.environment);
  const config = { ...environmentConfig, ...options.config };

  const parameters = new TenantProcessLoadParameterStore();
  const explorer = new TenantProcessExplorer(config.tenantProcessRoot, parameters);
  const discoveries = await explorer.discover();
  if (!parameters.get(config.defaultTenantProcessId)) {
    throw new Error(
      `Default TenantProcess ${config.defaultTenantProcessId} was not validated during planner startup discovery.`,
    );
  }

  const gateway = new SqliteTaskStorageGateway(config.databasePath, {
    defaultTenantProcessId: config.defaultTenantProcessId,
    isTenantProcessRegistered: (tenantProcessId) => parameters.get(tenantProcessId) !== undefined,
  });
  const traceAdapter = new SqlSystemTraceAdapter(config.databasePath);
  const traceRecorder = new SystemTraceRecorder({ adapter: traceAdapter });
  const loader = new TenantProcessLoader(parameters);
  const executionWorkPublisher = options.executionWorkPublisher
    ?? new TaskStorageExecutionWorkPublisher(gateway);

  const pool = new PlannerWorkerPool({
    poolId: config.poolId,
    concurrency: config.concurrency,
    pollIntervalMs: config.pollIntervalMs,
    workerIdFactory: options.workerIdFactory,
    onWorkerError: options.onWorkerError,
    workerFactory: (workerId) => new PlannerWorker(
      workerId,
      gateway,
      executionWorkPublisher,
      explorer,
      loader,
      traceRecorder,
    ),
  });

  return new PlannerService({
    pool,
    validatedTenantProcessIds: discoveries.map((entry) => entry.tenantProcessId),
    resources: [gateway, traceAdapter],
  });
}
