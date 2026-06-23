import { resolve } from 'node:path';
import { createTaskApi } from '../modules/API/TaskApi.js';
import { SystemTraceRecorder } from '../modules/SystemTrace/index.js';
import { SqlSystemTraceAdapter, SqlSystemTraceQueryRepository } from '../modules/SystemTrace/sqlTracePersistence.js';
import { TenantProcessExplorer } from '../infrastructure/tenant-process/TenantProcessExplorer.js';
import { TenantProcessLoadParameterStore } from '../infrastructure/tenant-process/TenantProcessLoadParameterStore.js';
import { SqliteTaskStorageGateway } from '../infrastructure/task-storage/SqliteTaskStorageGateway.js';
const DEFAULT_TENANT_PROCESS_ID = 'TaskStream/Test1' as const;

const databasePath = resolve('temp-infra/storage/IEBBeta/Test1/task-storage.sqlite');
const tenantProcessParameters = new TenantProcessLoadParameterStore();
const tenantProcessExplorer = new TenantProcessExplorer(resolve('Tenants'), tenantProcessParameters);
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
const server = createTaskApi(gateway, { traceRecorder, traceRepository });
const port = Number(process.env.PORT ?? 3100);
server.listen(port, () => {
  console.log(`IEBBeta/Test1 POC API listening on http://localhost:${port}`);
  console.log(`SQLite database: ${databasePath}`);
  console.log('Planner processing is owned by the standalone Planner service.');
  console.log(`Validated TenantProcesses: ${discoveries.map((entry) => entry.tenantProcessId).join(', ')}`);
});

function shutdown(): void {
  server.close(() => {
    gateway.close();
    traceAdapter.close();
    traceRepository.close();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
