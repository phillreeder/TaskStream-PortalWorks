import { resolve } from 'node:path';
import { createTaskApi } from '../modules/API/TaskApi.js';
import { SystemTraceRecorder } from '../modules/SystemTrace/index.js';
import { SqlSystemTraceAdapter, SqlSystemTraceQueryRepository } from '../modules/SystemTrace/sqlTracePersistence.js';
import { PlannerWorker } from './planning/PlannerWorker.js';
import { PocTenantProcessExplorer } from './planning/PocTenantProcessExplorer.js';
import { PocTenantProcessLoader } from './planning/PocTenantProcessLoader.js';
import { PocTenantProcessLoadParameterStore } from './planning/PocTenantProcessLoadParameterStore.js';
import { SqliteTaskStorageGateway } from './task-storage/Test1/SqliteTaskStorageGateway.js';
import { DEFAULT_TENANT_PROCESS_ID } from './task-storage/Test1/types.js';

const databasePath = resolve('temp-infra/storage/IEBBeta/Test1/task-storage.sqlite');
const tenantProcessParameters = new PocTenantProcessLoadParameterStore();
const tenantProcessExplorer = new PocTenantProcessExplorer(resolve('Tenants'), tenantProcessParameters);
const discoveries = await tenantProcessExplorer.discover();
if (!tenantProcessParameters.get(DEFAULT_TENANT_PROCESS_ID)) {
  throw new Error(`Default TenantProcess ${DEFAULT_TENANT_PROCESS_ID} was not validated during startup discovery.`);
}
const gateway = new SqliteTaskStorageGateway(databasePath, {
  defaultTenantProcessId: DEFAULT_TENANT_PROCESS_ID,
  isTenantProcessRegistered: (tenantProcessId) => tenantProcessParameters.get(tenantProcessId) !== undefined,
});
const traceAdapter = new SqlSystemTraceAdapter(databasePath);
const traceRecorder = new SystemTraceRecorder({ adapter: traceAdapter });
const traceRepository = new SqlSystemTraceQueryRepository(databasePath);
const tenantProcessLoader = new PocTenantProcessLoader(tenantProcessParameters);
const worker = new PlannerWorker(
  'poc-planner-worker-1',
  gateway,
  tenantProcessExplorer,
  tenantProcessLoader,
  traceRecorder,
);
const server = createTaskApi(gateway, { traceRecorder, traceRepository });
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
  console.log(`Validated TenantProcesses: ${discoveries.map((entry) => entry.tenantProcessId).join(', ')}`);
});

function shutdown(): void {
  clearInterval(workerTimer);
  server.close(() => {
    gateway.close();
    traceAdapter.close();
    traceRepository.close();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
