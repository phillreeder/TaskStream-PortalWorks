import { resolve } from 'node:path';
import { createTaskApi } from '../modules/API/TaskApi.js';
import { PlannerWorker } from './planning/PlannerWorker.js';
import { SqliteTaskStorageGateway } from './tenant-process/Test1/task-storage/SqliteTaskStorageGateway.js';

const databasePath = resolve('temp-infra/storage/IEBBeta/Test1/task-storage.sqlite');
const gateway = new SqliteTaskStorageGateway(databasePath);
const worker = new PlannerWorker('poc-planner-worker-1', gateway);
const server = createTaskApi(gateway);
const port = Number(process.env.PORT ?? 3100);
const pollIntervalMs = Number(process.env.PLANNER_WORKER_POLL_MS ?? 500);

const workerTimer = setInterval(() => {
  void worker.runOnce().catch((error) => {
    console.error('Planner worker iteration failed.', error);
  });
}, pollIntervalMs);

server.listen(port, () => {
  console.log(`IEBBeta/Test1 POC API listening on http://localhost:${port}`);
  console.log(`SQLite database: ${databasePath}`);
  console.log(`Planner worker polling every ${pollIntervalMs}ms`);
});

function shutdown(): void {
  clearInterval(workerTimer);
  server.close(() => {
    gateway.close();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
