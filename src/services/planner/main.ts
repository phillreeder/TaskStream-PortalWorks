import { createPlannerService } from './createPlannerService.js';
import { PlannerServiceRuntime } from './PlannerServiceRuntime.js';

async function main(): Promise<void> {
  const service = await createPlannerService({
    onWorkerError: (error, workerId) => {
      console.error(`Planner worker iteration failed: worker=${workerId}`, error);
    },
  });
  const runtime = new PlannerServiceRuntime({
    service,
    onStarted: () => {
      console.info(`Planner service started: pool=${service.pool.poolId}, workers=${service.pool.size}`);
      console.info(`Validated TenantProcesses: ${service.validatedTenantProcessIds.join(', ')}`);
    },
    onStopped: () => {
      console.info('Planner service stopped.');
    },
    onError: (error) => {
      console.error('Planner service shutdown failed.', error);
    },
  });

  runtime.start();
}

void main().catch((error) => {
  console.error('Planner service failed to start.', error);
  process.exitCode = 1;
});
