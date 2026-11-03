# Repository Agent Instructions

This file applies to **all contributors and agents** working in this repository: ChatGPT, Codex, Claude, Cursor, Copilot, Gemini, local agents, scripts acting as agents, and humans.

The repository—not a chat session—is the durable source of work state.

Canonical cross-repository delivery protocol:

`reallaksh19/Common/skills/engineering-pr-delivery/`

Also load `.agents/AGENTS.md` for repository-specific coding constraints. If rules overlap, this root file governs delivery/recovery/handover; `.agents/AGENTS.md` may impose stricter coding constraints.

## 1. Mixed engineering criticality

Classify each work item independently. Treat changes affecting vibration/FIV/AIV/FIT calculations, engineering master data, XML/CII engineering semantics, topology/geometry authority, support/classification authority, engineering exports, units, numerical recovery, or result publication as `ENGINEERING_CRITICAL` unless a stronger classification is required.

Pure presentation work may be `STANDARD` only when it cannot alter engineering authority, persisted engineering state, topology, calculation inputs/results, or engineering exports.

## 2. Continuous handover invariant

Assume the active agent may disappear, lose context, become incapable, or be replaced after any meaningful action.

At every durable checkpoint another qualified agent must be able to recover the mission, current truth, evidence, partial work, risks, authority boundaries, validation state, and exact next action from repository + PR artifacts without chat history.

No essential technical state may exist only in private reasoning or conversation history.

## 3. Live grounding before mutation

Before changing production or engineering-sensitive files, determine from live Git/GitHub where available:

- current base/main SHA;
- WIP/branch/PR identity;
- PR head and merge base;
- actual changed files and commits;
- checks/workflows and review state;
- source task/issue;
- predecessor/follow-on PRs;
- other active PR/WIP overlap;
- base drift.

Live mutable repository state overrides stale reports and prior conversation.

## 4. Durable WIP/PR identity

Before PR allocation use a unique identity:

```text
WIP-<short-id>
agents/WIP-<short-id>_workreport.md
```

Do not use one shared `PR_PENDING_workreport.md`.

After PR allocation use:

```text
agents/PR<NUMBER>_workreport.md
```

If `agents/status/`, `agents/claims/`, or `agents/MASTER_INDEX.md` exist, keep them current and reconcile them against live GitHub state.

The work report must remain recovery-first and continuously preserve mission/scope, current implementation, partial work, active findings/risks/decisions/questions, current hypothesis and falsifier, authority/invariants, validation PASS/FAIL/NOT_RUN, changed-file ledger, reviews/checks, highest risk, exact work location, and one executable `EXACT_NEXT_ACTION`.

## 5. Takeover begins READ_ONLY

For engineering-critical takeover:

```text
TAKEOVER_AUTHORITY = READ_ONLY
```

Before production mutation the incoming agent must re-ground independently, reconcile the prior report against the actual PR, inspect critical code/tests/evidence, classify stale/contradicted/inherited facts, complete repository-specific Appendix A qualification, and decide whether to `CONTINUE`, `QUARANTINE`, `SALVAGE_PARTIAL`, or `SUPERSEDE`.

Do not grant implementation authority because an agent claims expertise.

## 6. Appendix A — Implementation Takeover Qualification

Appendix A is an implementation authorization gate, not a theory quiz.

Normally require:

```text
A1 Production Trace
A2 Current Failure Isolation
A3 Authority / Invariant
A4 Independent Validation
A5 Next-Commit / Minimal Patch
```

A question is invalid if it can be answered correctly without opening the current repository, PR diff, tests, evidence, or work report.

Prefer `trace`, `reproduce`, `calculate`, `isolate`, `predict`, `falsify`, `compare`, `prove`, `reconcile`, and exact patch-boundary tasks over generic `define`/`describe`/`explain` questions.

Engineering-critical default qualification:

```text
total >= 92/100
minimum per challenge >= 17/20
```

Fabricated repository evidence, unsafe engineering claims, incorrect authority assumptions, or validation gaming may fail immediately regardless of score.

## 7. Multi-agent coordination

Before implementation and before each new stage inspect other active PRs/WIPs for:

- exact files and path-prefix overlap;
- engineering/software authority overlap;
- shared master data / validation / release infrastructure;
- dependencies and stacked PR lineage;
- base drift.

Classify:

```text
SAFE
COORDINATION_REQUIRED
BLOCKED_BY_ACTIVE_CLAIM
UNKNOWN
```

No exact-file overlap does not prove authority independence.

## 8. Validation integrity

Every material check must distinguish:

```text
STATUS      = PASS | FAIL | NOT_RUN | NOT_APPLICABLE
OBSERVATION = execution/inspection/inference basis
ORACLE      = implementation-coupled or independent authority class
```

Never weaken tolerances merely because a test fails, replace independent expected values with production output, change implementation and oracle together and call the result independent, delete difficult benchmarks to obtain green status, hard-code test answers into production, silence fail-closed behavior, or claim `NOT_RUN` as `PASS`.

UI/canvas/rendering evidence does not by itself establish engineering numerical authority.

## 9. Damaged PRs and incapable agents

Do not preserve a PR because of sunk effort.

If the report cannot explain the diff, authority is unclear, commits cannot be classified, expected values changed with implementation, or conflict resolution requires guessing engineering intent, quarantine and assess salvage.

Valid outcomes:

```text
CONTINUE
SALVAGE_PARTIAL
SUPERSEDE
ABANDON
```

Preserve known-good commits, benchmarks, independent evidence, decisions, invariants and provenance even if the implementation PR is superseded.

## 10. Scope and merge discipline

- One coherent assignment per PR unless the owner explicitly changes scope.
- Keep changes surgical and explain every changed file.
- Do not silently broaden scope.
- Do not modify workflow files unless explicitly authorized.
- Keep the PR handover-ready while waiting for review/merge.
- **Never merge without explicit owner authorization.**

## 11. AUTO MODE — autonomous phase execution

The exact owner keyword `AUTO MODE` sets:

```text
EXECUTION_MODE = AUTO
AUTO_STATE = RUNNING
SCOPE_AUTHORITY = LOCKED_TO_APPROVED_MISSION
PHASE_PROGRESSION = AUTO
MERGE_AUTHORITY = OWNER_ONLY
```

AUTO MODE authorizes automatic phase progression through the approved plan. It does not authorize scope expansion, protected authority changes, weakening validation, destructive actions, or merge.

After each phase the agent must validate, synchronize the work report/status/claims/Appendix A as needed, reconcile changed files, create a durable checkpoint, evaluate hard stops, and continue automatically when none applies. Routine phase completion is not a reason to ask for confirmation.

In addition to universal hard stops, stop AUTO when continuing requires an unapproved change to vibration/FIV/AIV/FIT numerical authority, engineering master data, XML/CII semantics, topology/geometry authority, support/classification authority, runtime/writer/canvas ownership, engineering export semantics, units, numerical recovery, or result-publication authority.

Bounded diagnosis and repairs inside approved scope are allowed. If repeated attempts do not narrow uncertainty, or the agent cannot state a concrete hypothesis, falsifier, next isolating experiment, and protected invariants, stop production mutation and set:

```text
PR_RECOVERY_STATE = TAKEOVER_REQUIRED
TAKEOVER_AUTHORITY = READ_ONLY
AUTO_STATE = TAKEOVER_REQUIRED
```

Refresh the work report and Appendix A for immediate takeover.

`AUTO MODE` never implies `AUTO MERGE`; merge remains owner-only unless separately and explicitly authorized.
