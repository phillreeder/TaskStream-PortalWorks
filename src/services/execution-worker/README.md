# Execution Worker microservice

This service is the production-shaped execution boundary for distributed Flow workers.

```text
ModuleLink ingress
  -> ExecutionQueue
  -> ExecutionWorkerPool
  -> ExecutionWorker
  -> ExecutionService
  -> FlowExecutor
  -> queue completion/retry/failure
  -> optional ModuleLink completion publication
```

## Executable service

The worker is started independently from the API and planner processes:

```bash
npm run execution-worker:dev
```

The executable composition root is `main.ts`. It owns only configuration, construction,
service lifecycle, and graceful `SIGINT` / `SIGTERM` shutdown.

Environment variables:

```text
EXECUTION_WORKER_POOL_ID=execution.default
EXECUTION_WORKER_CONCURRENCY=1
EXECUTION_WORKER_POLL_INTERVAL_MS=250
```

## Current boundaries

- one injectable queue per pool;
- configurable local concurrency;
- lease-based claim contract suitable for a future distributed queue adapter;
- worker and pool identity preserved in completions;
- ModuleLink submission and completion boundaries;
- no routing layer yet;
- no ModuleLink cross-process transport yet;
- no real FlowExecutor yet - the default implementation fails work cleanly with
  `FLOW_EXECUTOR_UNAVAILABLE`.

The local entrypoint currently constructs an in-process ModuleLink and in-memory queue. Future
ModuleLink transport and durable queue adapters should be injected through
`createExecutionWorkerMicroservice` without changing the pool, worker, or execution service.

The in-memory queue is a development adapter only. Correctness in a distributed deployment must
be owned by a durable queue implementation providing authoritative claims and leases.
