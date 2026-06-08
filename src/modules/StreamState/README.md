# StreamState Module Scaffold

This implementation scaffold mirrors the current TaskStream Docs module authority:

```text
TaskStream-Docs: modules/StreamState/
```

## What is intentionally present

The scaffold currently contains only the app-side module shell for the documented StreamState Module responsibilities:

```text
StreamStateModule
  owns the initial in-process access boundary

InMemoryStateChangeQueue
  stages verified state changes in the single-server/modulith runtime

StateConsolidator
  produces ResolvedStreamState from authoritative state plus admissible pending changes

StateReservationRegistry
  tracks active reservations over state paths/intention
  this is not a work queue

StreamStatePlanningContract
  provided before deterministic Channel execution

StateReservationContract
  issued after Channel/STO resolution and before ExecutionIntent release
```

## What is intentionally not present yet

```text
RemoteStreamStateAdapter
StreamState API/transport host
PostgresStreamStateStore
external expectation resolver
StateDefinition-aware path admissibility
FlowPlanning integration
FlowExecution integration
```

Those are documented responsibilities, but this scaffold does not wire them into the runtime yet.

## Application boundary

The main application should eventually compose this module and inject its accessor into planning/execution hosts.

StreamState-specific logic should not live in application planners, generic infrastructure repositories, or direct persistence access paths once the module is integrated.
