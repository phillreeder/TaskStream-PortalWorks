import { createExecutionWorkerMicroservice } from './createExecutionWorkerMicroservice.js';
import { ExecutionWorkerServiceRuntime } from './ExecutionWorkerServiceRuntime.js';

const service = createExecutionWorkerMicroservice();
const runtime = new ExecutionWorkerServiceRuntime({
  service,
  onStarted: () => {
    console.info(`Execution worker service started: pool=${service.pool.poolId}, workers=${service.pool.size}`);
  },
  onStopped: () => {
    console.info('Execution worker service stopped.');
  },
  onError: (error) => {
    console.error('Execution worker service shutdown failed.', error);
  },
});

runtime.start();
