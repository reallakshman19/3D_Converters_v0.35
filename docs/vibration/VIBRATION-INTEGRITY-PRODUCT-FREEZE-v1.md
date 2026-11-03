# Vibration Integrity Product Freeze v1

Status: **CANDIDATE PRODUCT CONTRACT**  
Scope: Vibration Integrity facility workflow and product UI  
Engineering authority: **NONE — product contract only**

## 1. Purpose

Stabilize the Vibration Integrity product experience before further mechanism/numerical expansion. Future calculation improvements must integrate behind this contract rather than repeatedly changing the user journey.

This freeze does **not** qualify any engineering method and does not change FIT, Mechanical, SBC or future mechanism authority.

## 2. Frozen workspace navigation

Order and IDs:

```text
screening   — Screening workspace
mechanical  — Mechanical T2.3
user-data   — User Engineering Data
activity    — Activity & workflow
```

Canonical selector:

```text
data-vi-workspace-tab="<id>"
```

Changing an ID, meaning or order requires an intentional UI contract-version change plus migration tests.

## 3. Frozen product workflow states

```text
EMPTY
INPUTS_LOADED
READY_CHECKED
RUNNING
RESULT_CURRENT
RESULT_STALE
INVALID_INPUT
```

The workflow state is observational. It is derived from current product state and performs no engineering calculation.

Canonical selector:

```text
data-vi-workflow-state="<state>"
```

## 4. Frozen governing/authority presentation

The product must continue to distinguish:

```text
screeningGoverning   = authorized screening mechanisms only
candidateGoverning   = non-authorizing candidate mechanisms
```

Current authority boundary:

```text
FIT        SCREENING / AUTHORIZED_BOUNDED
Mechanical CANDIDATE_MASTER / NOT_AUTHORIZED
SBC        CANDIDATE_USER_INPUT / NOT_AUTHORIZED
Design authority = false
```

Candidate values must never visually or structurally masquerade as screening authority.

## 5. Activity journal

Schema:

```text
VibrationIntegrityAuditLog.v1
VibrationIntegrityAuditEvent.v1
VibrationIntegrityAuditExport.v1
```

Each event contains:

```text
sequence
eventId
timestamp
eventType
workflowBefore
workflowAfter
scopeId
details
authority
```

Rules:

- append-only immutable records;
- deterministic sequence within a workspace session;
- facility scope retained when relevant;
- details bounded to small metadata, never complete engineering tables;
- unknown event types fail closed;
- journal authority is always `engineeringAuthority = NONE`;
- activity logging cannot modify engineering inputs or results.

Canonical selectors:

```text
data-vi-audit-log
data-vi-audit-event
data-vi-action="export-audit"
```

## 6. Evidence compatibility

Existing FIT evidence remains:

```text
FitRunEvidencePackage.v1
```

Stage 5 does not replace or silently mutate this schema. The product activity log is exported independently. A future unified evidence envelope may wrap both artifacts but must retain the FIT package intact or provide an explicit migration.

## 7. Stable primary workflow

```text
Import / load benchmark
  -> inspect/edit working tables
  -> check readiness
  -> resolve blockers if required
  -> run FIT screening
  -> review screening governing + candidate governing
  -> complete mechanism-specific candidate inputs as required
  -> review Activity & workflow
  -> export register / FIT evidence / activity log
```

Input changes after a current run must move the product to `RESULT_STALE` and require rerun before the changed result is current.

## 8. Change-control policy

The following are **not** reasons to churn this contract:

- small curve-digitization improvements;
- additional decimal precision;
- adding a new governed master row;
- adding a new candidate mechanism;
- internal calculator refactors;
- new benchmark examples.

A contract version change is justified only when the product workflow itself requires a materially different user action, state, evidence obligation or authority representation.

## 9. Deferred numerical work

PR #508 is intentionally deferred under the Owner's 2026-08-15 direction to prioritize product freeze, workflow and logging. Any resumed SBC master-assisted accuracy work must be rebuilt on current main and integrate behind this product contract.
