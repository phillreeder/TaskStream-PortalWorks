# Flat RuntimeScaffold platform findings

## Purpose

Record platform-level limitations exposed by real mission execution without turning mission-specific assumptions into scaffold behavior.

## Findings

### RS-WEB-001 — Browser resource declaration and `ctx.web`

- **Classification:** Missing capability — resolved in Step 001.
- **Evidence:** The flat pathway could compose Unit, artifact, logger, credential, and HTTP accessors but could not supply a BrowserStream to an STO-selected Flow.
- **Resolution:** A selected STO may now declare a generic `browser-stream` requirement. RuntimeScaffold composes the configured WebAutomation resource spine and exposes only the lease-scoped `ctx.web` accessor to the Flow.
- **Boundary:** URLs, platform targets, capture anchors, and mission state transitions remain in TenantProcess code and config input.

### RS-WEB-002 — File-only evidence retrieval

- **Classification:** Scaffold limitation — accepted temporarily.
- **Evidence:** The user-in-the-middle loop needs evidence that can be transferred back as one artifact, while the scaffold has no indexed evidence repository.
- **Current workaround:** Capture files and a store-only ZIP are written under the Run directory and surfaced by the CLI.
- **Deferred platform capability:** Evidence catalogue, content addressing, query/index support, retention policy, and cross-run retrieval.

### RS-WEB-003 — Authentication persistence

- **Classification:** Scaffold limitation — accepted temporarily.
- **Evidence:** LinkedIn authentication must survive separate Runs while the current flat pathway has no credential/session checkpoint service.
- **Current workaround:** WebAutomation uses a configured persistent browser profile outside individual Run directories.
- **Deferred platform capability:** Explicit session checkpoint authority, expiry detection, secure account binding, and human re-authentication state.

### RS-WEB-004 — WebAutomation package identity drift

- **Classification:** Platform integration defect — resolved in Step 001.
- **Evidence:** TaskStream still referenced the retired `@TaskStream/SiteAutomation` workspace identity while the package authority is `@taskstream/web-automation`.
- **Resolution:** Root dependency and TypeScript paths now use the current public package and subpath identities.

### RS-WEB-005 — Human-intervention lifecycle

- **Classification:** Weak abstraction — deferred.
- **Evidence:** The discovery loop currently pauses because the next Flow returns success without changing state; the operator then returns evidence and applies the next patch.
- **Current workaround:** `page_inspected` plus an unchanged pause Flow gives deterministic termination without refresh or retry loops.
- **Deferred platform capability:** A first-class `awaiting-human-input` outcome with resumable run correlation and explicit evidence acknowledgement.

### RS-WEB-006 — Failed Runs were not transferable

- **Classification:** Scaffold limitation — resolved after the first Step 001 execution.
- **Evidence:** The scaffold returned a failed Run directory but an empty `evidenceArchives` list, while the CLI omitted the persisted failure reason.
- **Resolution:** Every `failed` or `blocked` flat Run now emits a generic failure-evidence ZIP containing command/config snapshots, the Run trace, state and lifecycle records, partial artifacts, and a failure summary. The CLI also surfaces `reason`.
- **Boundary:** The scaffold packages evidence only. Diagnosis, retry policy, recovery Flow selection, and portal-specific handling remain TenantProcess responsibilities.
