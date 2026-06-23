# Planner service

The Planner service is the independently executable owner of planning-worker lifecycle.

```text
planning queue
  -> PlannerWorkerPool
  -> PlannerWorker
  -> TenantProcess discovery
  -> TenantProcessPlanningPipeline instance
     -> load and validate TenantProcess
     -> resolve queued Task key
     -> resolve Channel
     -> load StreamState (temporary defaults fallback)
     -> create Channel context
     -> invoke Channel
     -> validate selected STO
     -> resolve Flow
     -> create execution dispatch
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
PLANNER_DEFAULT_TASK_REF=processWork
```

## Boundaries

- `PlannerWorker` owns one claimed planning item and invokes the planning stages in explicit order.
- `TenantProcessPlanningPipeline` is a single-use, per-queue-item planning workspace; it must not be shared across workers.
- `PlannerWorkerPool` owns local concurrency and polling, not planning decisions.
- `PlannerService` owns pool and dependency-resource lifecycle.
- `PlannerServiceRuntime` owns process signals and graceful shutdown.
- `main.ts` owns configuration and composition only.
- `ExecutionWorkPublisher` is the outbound execution boundary.
- Queue items carry `sourceTaskId`, authoritative `taskRef`, and redundant `taskName`; planning never guesses by counting TenantProcess tasks.
- `loadStreamState()` currently uses StateDefinition defaults only as a visible POC fallback and must be replaced by the authoritative StreamState service boundary.

The current publisher persists execution work through the TaskStorage adapter so the existing POC remains observable. A future router/ModuleLink publisher can replace that adapter without changing PlannerWorker, its pool, or the Planner service lifecycle.
