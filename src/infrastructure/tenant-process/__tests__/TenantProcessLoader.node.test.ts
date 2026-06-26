import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { TenantProcessExplorer } from '../TenantProcessExplorer.js';
import { TenantProcessLoadError, TenantProcessLoader } from '../TenantProcessLoader.js';
import { TenantProcessLoadParameterStore } from '../TenantProcessLoadParameterStore.js';

const tenantsRoot = fileURLToPath(new URL('../../../../Tenants/', import.meta.url));

test('[tickets: POC-TENANTPROCESS-LAZY-LOAD-001] explorer discovers and registers TenantProcess load parameters', async () => {
  const store = new TenantProcessLoadParameterStore();
  const explorer = new TenantProcessExplorer(tenantsRoot, store);

  const discoveries = await explorer.discover();

  assert.ok(discoveries.some((entry) => entry.tenantProcessId === 'TaskStream/Test1'));
  assert.ok(store.get('TaskStream/Test1'));
  assert.deepEqual(
    discoveries.find((entry) => entry.tenantProcessId === 'TaskStream/Test1')?.tenantProcessIdentity,
    { tenant: 'TaskStream', process: 'Test1' },
  );
});

test('[tickets: POC-TENANTPROCESS-LAZY-LOAD-001] direct loader resolves the real Test1 TenantProcess from discovered parameters', async () => {
  const store = new TenantProcessLoadParameterStore();
  const explorer = new TenantProcessExplorer(tenantsRoot, store);
  const loader = new TenantProcessLoader(store);
  await explorer.discover();

  const resolution = await loader.load({ tenantProcessId: 'TaskStream/Test1' });

  assert.equal(resolution.requestedTenantProcessId, 'TaskStream/Test1');
  assert.equal(resolution.resolvedTenantProcessId, 'TaskStream/Test1');
  assert.match(resolution.loaderKey, /TaskStream\/TenantProcess\/Test1/u);
  assert.equal(resolution.tenantProcess.tasks.processWork?.activationFlow.flowId, 'activateProcessWork');
  assert.equal(typeof resolution.tenantProcess.tasks.processWork?.activationFlow.executable, 'function');
  assert.equal(resolution.tenantProcess.stos.prepareWork?.flow.flowId, 'prepareWork');
  assert.equal(typeof resolution.tenantProcess.stos.prepareWork?.flow.executable, 'function');
});

test('[tickets: POC-TENANTPROCESS-LAZY-LOAD-001] direct loader rejects IDs that discovery did not register', async () => {
  const loader = new TenantProcessLoader(new TenantProcessLoadParameterStore());

  await assert.rejects(
    () => loader.load({ tenantProcessId: 'tenant-process.unknown' }),
    (error) => error instanceof TenantProcessLoadError && error.code === 'POC_TENANT_PROCESS_PARAMETERS_NOT_REGISTERED',
  );
});

test('[tickets: POC-TENANTPROCESS-REGISTRATION-GATE-001] explorer excludes incomplete TenantProcess folders from loadable registration', async () => {
  const store = new TenantProcessLoadParameterStore();
  const explorer = new TenantProcessExplorer(tenantsRoot, store);

  const discoveries = await explorer.discover();

  assert.ok(!discoveries.some((entry) => entry.loaderKey.endsWith('/runtime-spine-001')));
  assert.equal(store.get('TaskStream/runtime-spine-001'), undefined);
});
