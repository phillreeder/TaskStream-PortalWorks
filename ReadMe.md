# TaskStream

Deterministic, state-driven execution engine for managed automation.

---

# Overview

TaskStream executes tenant-defined processes with strict separation between:

* planning (decision)
* execution (contract fulfillment)
* state (constraint authority)

All behavior originates from **TenantProcess** definitions.

---

# Core Principles

```
- deterministic execution
- no implicit logic
- strict separation of planning and execution
- state-driven transitions only
- all side effects isolated behind boundaries
```

---

# Architecture

Full architecture documentation: [docs/System/Architecture](docs/System/Architeccture)

Key documents:

* System Structure
* Module Mapping
* Planning Loop
* Execution Loop
* Invariants

---

# Repository Structure

```
/src
  /domain
  /domain/logic
  /application
  /interfaces
  /infrastructure
  /workers
  /test-utils
```

See [docs/System/Architecture](docs/System/Architeccture)

---

# Execution Model

```
Event → Planner → STO → Run → Execution → State Update
```

* Planner selects STO
* Execution fulfills STO contract
* StateDefinition governs all state changes

---

# Development

## Setup

```
npm install
```

## Run Tests (deterministic environment)

```
npm run test
```

## Full Validation (CI equivalent)

```
npm run test:full
```

## Test Containers

```
docker compose -f docker-compose.test.yml up --build
```

---

# Implementation Rules

See [Development Guide](docs/development/implementation/DevelopmentGuide.md)

Key constraints:

```
- no side effects outside adapters
- flows are orchestration only
- planner is pure decision layer
- execution performs only
```

---

# Key Concepts

* TenantProcess → defines behavior
* STO → defines valid transitions
* Flow → defines execution steps
* StateDefinition → defines constraints
* StreamState → represents current state

---

# Notes

* Code executes behavior, it does not define it
* All behavior must originate from TenantProcess

---

# Status

Active development —
