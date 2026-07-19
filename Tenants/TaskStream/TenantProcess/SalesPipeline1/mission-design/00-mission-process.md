# SalesPipeline1 mission scratch

## Scope

This scratch defines the complete mission needed to:

1. search for relevant people;
2. send connection requests;
3. detect accepted connections;
4. send the first message.

It does not define browser or web user-interface coordination. External page observations and action receipts are treated as Flow inputs or temporary fixtures.

It does not change TaskStream fundamentals. It works within the existing model:

```text
ProcessChannel selects work
  -> Channel selects an STO
  -> STO supplies task, edge, or process authority
  -> Flow receives the permitted state facade
  -> StateDefinition validates proposed changes
```

## Context hierarchy

```text
SystemParams
  global runtime limits, hard safety caps, credential and browser policy

ClientParams
  client identity, account ownership, brand voice, exclusions and client limits

ProcessState
  project parameters and cross-Task mission authority

TaskState
  Task-owned cycle membership, staged records and local progress

StreamState
  one objective or candidate execution unit and its micro-state
```

Lower scopes should read ancestor values through a materialized context. They should not copy SystemParams, ClientParams or project parameters into every TaskState and StreamState.

ProcessState contains `clientRef` and `systemPolicyRef`, not duplicated client and system data. Effective limits can later be resolved as the strictest applicable System, Client and Process value.

## Core ownership decision

Candidates must be ProcessState-owned because they are created by the Search Task, consumed by the Connection Task, and consumed again by the First Message Task.

However, ordinary Task-authority Flows cannot write ProcessState. Therefore each Task stages its output locally:

```text
Task Flow
  updates StreamState

Edge Flow
  closes the Stream and adds Task-owned staged records

Process Flow
  promotes staged Task records into ProcessState
```

This is not redundant authority:

- TaskState is an unpromoted work area owned by one Task.
- ProcessState is the canonical cross-Task record after promotion.
- Promotion is explicit, auditable and restartable.

## ProcessState

ProcessState owns two kinds of information.

### Project parameters

- project, client, system-policy and platform account references;
- search objectives and search terms;
- search limits and exclusions;
- connection request and reconciliation policy;
- first-message template/variant references and send limits;
- mission target, such as number of first messages sent.

Search terms belong here because they are project parameters, not Stream-owned discoveries.

### Cross-Task runtime authority

- coarse mission status;
- Task progress summaries;
- mission counters;
- candidate records;
- connection-attempt records;
- first-message records.

Candidate records should use separate status dimensions rather than one overloaded pipeline stage:

```text
eligibilityStatus
connectionStatus
firstMessageStatus
```

This allows a candidate to remain `request_pending` while the mission continues searching for or connecting other candidates.

## Physical storage

Logical ProcessState does not need to be serialized as one growing JSON object.

For the temporary RuntimeScaffold sidecar, use:

```text
<mission-root>/
  process/
    state.json
    records/
      candidates/<candidateKey>.json
      connectionAttempts/<attemptRef>.json
      firstMessages/<messageRef>.json

  tasks/
    searchConnections/
      state.json
      records/discoveries/<candidateKey>.json
    connectionAcquisition/
      state.json
      records/attempts/<attemptRef>.json
    sendFirstMessages/
      state.json
      records/messages/<messageRef>.json

  streams/
    <streamRef>/state.json

  journal.ndjson
```

The state scope is semantic ownership. The file layout is only a temporary persistence adapter.

Keyed record files avoid whole-collection replacement and allow one candidate or attempt to be updated without materializing every record. The temporary store may scan small fixture collections. Production storage can later replace this with indexed tables without changing state ownership.

## Task and Stream design

### SearchConnections Task

TaskState owns:

- current cycle and immutable objective membership;
- pending candidate keys discovered during the cycle;
- staged discovery records awaiting promotion;
- Stream completion counts and local errors.

A Search Stream represents one search objective and its page chain. It stores:

- objective reference;
- current page/cursor;
- page candidate keys;
- evidence reference;
- page and Stream phase.

The Stream references the ProcessState objective. The search term itself remains a project parameter and is materialized for execution.

### ConnectionAcquisition Task

This Task handles both request submission and later status reconciliation.

TaskState owns:

- cycle mode: `request` or `reconcile`;
- immutable candidate membership;
- staged connection-attempt records awaiting promotion;
- Stream completion counts and local errors.

A Connection Stream represents one candidate. It stores:

- candidate key;
- request/reconcile mode;
- observed external connection status;
- attempt reference;
- execution phase.

### SendFirstMessages Task

TaskState owns:

- immutable connected-candidate membership;
- staged message records awaiting promotion;
- Stream completion counts and local errors.

A First Message Stream represents one candidate. It stores:

- candidate key;
- rendered message and message reference;
- preparation/send phase;
- local error.

The project selects template and variant references in ProcessState. ClientParams may provide the reusable identity and voice configuration referenced by those project values.

## STO authority catalogue

### Task authority

Task STOs interpret already supplied data and update the current Stream:

```text
inspectSearchPage
inspectConnectionCandidate
executeConnectionAction
prepareFirstMessage
executeFirstMessageSend
```

They do not add ProcessState records or decide what Task runs next.

### Edge authority

Edge STOs establish or close bounded work:

```text
openSearchCycle
recordSearchPage
openConnectionCycle
recordConnectionOutcome
openFirstMessageCycle
recordFirstMessageOutcome
```

They freeze cycle membership, create/close Streams, and add staged records to TaskState. They do not promote those records across Task boundaries.

### Process authority

Process STOs coordinate the mission and own cross-Task promotion:

```text
initializeMission
promoteSearchResults
promoteConnectionResults
promoteFirstMessageResults
completeMission
```

These are the only STOs that add/update the shared ProcessState candidate, attempt and message records.

## Mission routing policy

The ProcessChannel should select the next useful Task from ProcessState, not follow a rigid linear stage flag.

Recommended priority:

```text
1. Send first messages to connected candidates that are ready.
2. Reconcile pending connection requests whose check time is due.
3. Send requests to eligible candidates that have not been requested.
4. Search for more candidates while objectives and candidate capacity remain.
5. Wait when pending requests exist but none are due.
6. Complete when the target is reached or all work is exhausted.
```

This matters because accepted connections can appear while search or request work remains. The process should react to candidate state rather than insist that every Search cycle finishes before any message is sent.

## Complete mission sequence

### 1. Initialize

`initializeMission` validates project parameters and makes SearchConnections ready.

### 2. Search cycle

```text
openSearchCycle (edge)
  selects objective refs from ProcessState
  freezes TaskState cycle membership
  creates one Stream per objective

inspectSearchPage (task)
  consumes a search-page observation
  proposes page/cursor/candidate-key Stream updates

recordSearchPage (edge)
  stores discovery records in Search TaskState
  advances or closes the Stream

promoteSearchResults (process)
  dedupes by platform profile key
  adds or enriches ProcessState candidates
  updates objective and mission counters
```

### 3. Connection request cycle

```text
openConnectionCycle (edge, mode=request)
  selects eligible, not-requested ProcessState candidates
  freezes candidate membership
  creates one candidate Stream each

inspectConnectionCandidate (task)
  consumes a candidate-profile observation
  records whether the candidate is connectable

executeConnectionAction (task)
  consumes the connection-action receipt

recordConnectionOutcome (edge)
  adds a TaskState connection-attempt record
  closes the candidate Stream

promoteConnectionResults (process)
  adds ProcessState attempts
  updates candidate connectionStatus and counters
```

### 4. Connection reconciliation cycle

After the configured wait:

```text
openConnectionCycle (edge, mode=reconcile)
  selects due request-pending candidates

inspectConnectionCandidate (task)
  consumes the current connection-status observation

recordConnectionOutcome (edge)
  stages a status-check attempt

promoteConnectionResults (process)
  marks candidates connected, still pending, declined or unavailable
  marks connected candidates firstMessageStatus=ready
```

### 5. First-message cycle

```text
openFirstMessageCycle (edge)
  selects connected, message-ready candidates
  freezes candidate membership
  creates one candidate Stream each

prepareFirstMessage (task)
  resolves template/variant references
  renders permitted personalization

executeFirstMessageSend (task)
  consumes the send receipt

recordFirstMessageOutcome (edge)
  stages the message record in TaskState
  closes the candidate Stream

promoteFirstMessageResults (process)
  adds the ProcessState message record
  updates candidate firstMessageStatus and counters
```

### 6. Complete, wait or continue

`selectNextMissionWork()` decides among another Task cycle, a wait state, target completion or exhausted completion.

## RuntimeScaffold bridge

The current flat RuntimeScaffold runs one Task with StreamState persistence. A temporary mission harness can sit outside it without changing TaskStream fundamentals:

```text
1. Read ProcessState and candidate records from MissionStateFileStore.
2. Run the scratch Process planner to select the next Task and batch.
3. Materialize that Task's initial Task/Stream inputs.
4. Invoke the existing FlatRuntimePathway for one bounded Task cycle.
5. Commit Task-local staged outputs through the sidecar store.
6. Apply the matching scratch Process promotion step.
7. Repeat.
```

This harness is disposable. The TenantProcess remains the semantic definition, STO authority remains enforced by TaskStream, and the sidecar can be removed when ProcessState and TaskState gain canonical runtime persistence.

## External fixture boundaries

Until browser coordination is designed, use deterministic inputs for:

- search-page observations;
- candidate profile/connection observations;
- connection action receipts;
- connection status observations;
- message send receipts.

These fixtures prove state handoff and Process routing. They must not encode DOM selectors, browser commands or user-interface control policy.

## Current deliberate gaps

- ProcessChannel composition is not added to the live TenantProcess.
- ProcessState and TaskState are not injected into the current `ctx.state` facade.
- Task/Process record mutation facades are not implemented.
- No browser or web UI orchestration is designed.
- No production storage or indexing decision is made.

The scratch files define the intended state ownership and executable mission shape without forcing those missing runtime seams prematurely.
