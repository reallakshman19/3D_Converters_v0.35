# PR451 — AIV Dedicated SVG Canvas Historical Work Report

## Merge reconciliation

PR #451 (`feat(aiv): add dedicated SVG relationship workspace`) was merged into `main` on 2026-08-13 by explicit owner instruction using the repository-required squash method.

```text
merge commit  007842eedb4498b8328cc3e864112a398c9d1fe4
source issue  #449
follow-up     #453
follow-up PR  #454
```

The detailed pre-merge work report remains available in Git history at the PR #451 branch/commits. This file is intentionally reduced to a post-merge reconciliation so `main` does not claim the PR is still draft/open or that merge is still pending.

## What PR #451 delivered

- dedicated AIV SVG relationship workspace;
- deterministic presentation-only layout;
- pan / zoom / node drag;
- canonical Source / Assessment / Operating Case table↔canvas selection;
- visual relationship create/delete through the authoritative relationship-table boundary;
- assumption/readiness provenance and field navigation;
- Source / relationship contribution / Assessment result explanation from returned result contracts;
- Current/All case and line presentation filtering;
- simultaneous-source returned contribution display without UI dB recombination;
- additive `AivCanvasScreeningExportPackage.v1`;
- indexed readiness projection and 100/300/500 projection/layout hardening coverage.

## Permanent authority boundary

```text
TABLES = engineering source of truth
SVG CANVAS = visual navigation / relationship editing / result explanation
screeningResultScope = ASSESSMENT
designAuthority = false
```

The SVG does not derive physical engineering distance, attenuation, point PWL, combined PWL, LOF, pipe dimensions, or topology authority from rendered coordinates or geometry.

## Validation state at the time of merge

The PR had native focused PASS evidence for earlier stages and reconstructed Node/source validation for later behavior slices. However, the following final acceptance gates were still NOT_RUN when the merge was requested:

```text
npm run verify:aiv-canvas        NOT_RUN on a native final checkout
real-browser acceptance          NOT_RUN
```

The final hosted AIV and Topology workflow jobs also did not execute. They had `runner_id=0`, zero steps and GitHub's Actions-budget no-start annotation. Their correct classification is:

```text
NOT_RUN / INFRASTRUCTURE_BLOCKED
```

not a product test failure.

## Remaining Definition-of-Done work

Post-merge review identified several #449 requirements that needed completion or stronger proof, including:

- controlled D.2.3 single/batch/canvas parity;
- true two-applicable-source integration for `160+160` and `160+150`;
- engineering-specific icon/status vocabulary;
- explicit RESULTS mode;
- always-available tabbed selected-item detail;
- Case/Line filtering synchronized with editable engineering rows;
- native and real-browser final acceptance.

Those items are tracked in **issue #453** and implemented/validated through **draft PR #454**.

## Current interpretation

```text
PR #451 implementation       MERGED
issue #449 implementation    substantially implemented by #451
issue #449 final DoD         completed only when #453 acceptance gates are satisfied
```

This reconciliation changes tracking metadata only; it does not alter AIV engineering authority or numerical implementation.
