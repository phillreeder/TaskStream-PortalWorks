import { resolve } from 'node:path';
import { createTaskApi } from '../modules/API/TaskApi.js';
import { SqliteTaskStorageGateway } from '../tenants/IEBBeta/TenantProcesses/Test1/task-storage/SqliteTaskStorageGateway.js';

const databasePath = resolve('temp-infra/storage/IEBBeta/Test1/task-storage.sqlite');
const gateway = new SqliteTaskStorageGateway(databasePath);
const server = createTaskApi(gateway);
const port = Number(process.env.PORT ?? 3100);

server.listen(port, () => {
  console.log(`IEBBeta/Test1 POC API listening on http://localhost:${port}`);
  console.log(`SQLite database: ${databasePath}`);
});

function shutdown(): void {
  server.close(() => {
    gateway.close();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
