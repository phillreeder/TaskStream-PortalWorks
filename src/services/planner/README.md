# Planner service

The Planner service is the independently executable owner of planning-worker lifecycle.

```text
planning queue
  -> PlannerWorkerPool
  -> PlannerWorker
  -> TenantProcess discovery and resolution
  -> ExecutionWorkPublisher
  -> planner queue completion/failure
```

## Executable service

```bash
npm run planner:dev
```

After build:

```bash
npm run planner:start
```

Environment variables:

```text
PLANNER_POOL_ID=planner.default
PLANNER_CONCURRENCY=1
PLANNER_POLL_INTERVAL_MS=500
PLANNER_DATABASE_PATH=temp-infra/storage/IEBBeta/Test1/task-storage.sqlite
PLANNER_TENANT_PROCESS_ROOT=Tenants
PLANNER_DEFAULT_TENANT_PROCESS_ID=TaskStream/Test1
```

## Boundaries

- `PlannerWorker` owns one claimed planning item, not process lifecycle.
- `PlannerWorkerPool` owns local concurrency and polling, not planning decisions.
- `PlannerService` owns pool and dependency-resource lifecycle.
- `PlannerServiceRuntime` owns process signals and graceful shutdown.
- `main.ts` owns configuration and composition only.
- `ExecutionWorkPublisher` is the outbound execution boundary.

The current publisher persists execution work through the TaskStorage adapter so the existing POC remains observable. A future router/ModuleLink publisher can replace that adapter without changing PlannerWorker, its pool, or the Planner service lifecycle.
