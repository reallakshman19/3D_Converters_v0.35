# Agent Coding Guidelines & Constraints

This workspace enforces strict architectural, coding, and workflow constraints. All agent actions must comply with the following rules:

## 1. File & Module Constraints
* **Line Limit**: Every new JavaScript file must be under **300 lines**. Split modules where possible.
* **Existing Files**: Only split existing files when edited, and a **backup is mandatory** before editing (using `node utils/backup.js save <file> "<context>"`).

## 2. Function & Clean Code Design
* **Function Size**: Every function must be under **40 lines** where practical.
* **Exports**: Use **named exports only** (no default exports).
* **Pure Functions**: Write pure functions where practical to enhance testability and predictability.
* **Mocking**: No default or hidden mocks. Mocks must be explicitly configured and visible.
* **Shims**: No shims or polyfills.
* **State & Mutation**: Avoid mutation-heavy design. Prefer immutable patterns and functional transformations.

## 3. Workflow & Operations
* **Scope Control**: No runtime, writer, or canvas switches unless explicitly approved by the user.
* **Data Churn**: No generated snapshot or data churn unless it is explicitly part of the mission.
* **Refactoring**: No broad refactors outside the assigned Work Pack. Keep changes scoped and surgical.
* **Linting & Dangling Code**: Keep code clean of lint errors and dangling/unused code. Verify this on every step.

## 4. PR / Delivery Criteria
* **Usable Capability**: Every PR/change must deliver usable capability, a UI action, an artifact, a measurable behavior improvement, or a measurable export improvement.
* **No Empty Audits**: Do not submit any PR whose main output is only "audit says ready" without delivering actual value or behavioral changes.
