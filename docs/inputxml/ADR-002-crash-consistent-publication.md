# ADR-002 — Crash-Consistent InputXML Artifact Publication

## Status

Accepted for the PR-3 artifact-publication increment.

## Context

The compiler produces three externally stable artifacts:

```text
<stem>.canonical.input.xml
<stem>.canonicalization-ledger.json
<stem>.canonical-validation.json
```

Writing these paths independently permits mixed or stale bundles. A failure after canonical XML is written but before its validation report is written can make an incomplete result appear current. A later blocked compilation without a canonical candidate can also leave an older canonical file in place.

Three independent files cannot be replaced as one indivisible filesystem operation.

## Decision

The compiler CLI uses a crash-consistent validation-commit-marker protocol:

1. Final canonical, ledger and validation bytes are produced before destination mutation.
2. One exclusive same-stem lock prevents concurrent publishers.
3. Unresolved transaction evidence blocks a new publication for that stem.
4. New files are staged inside the destination filesystem and flushed before use.
5. Existing artifacts are preserved inside a private rollback directory.
6. The old validation marker is moved first, invalidating the old committed bundle.
7. Canonical state is replaced, or removed for `BLOCKED_NO_CANONICAL`.
8. The ledger is replaced.
9. Validation is replaced last and declares `publication.state == COMMITTED`.
10. The final files are independently verified against the committed hashes.
11. A pre-commit failure restores the previous bundle, with validation restored last.
12. A rollback failure removes the final validation marker and raises an integrity error.

The compiler orchestration state remains terminal before publication. Publication has a separate transaction state and cannot turn a compiler `PASS` into a compiler `BLOCKED`.

## Stable result kinds

```text
PASS_WITH_CANONICAL
BLOCKED_WITH_CANONICAL
BLOCKED_NO_CANONICAL
```

The external compiler status remains only `PASS` or `BLOCKED`.

A blocked candidate may be published for inspection. Its existence is not acceptance evidence.

## Commit marker and consumer acceptance

Canonical XML file existence is not evidence of acceptance.

A consumer must require all of the following:

```text
validation file exists
publication.schema == InputXmlArtifactPublication.v1
publication.protocol == VALIDATION_COMMIT_MARKER_V1
publication.state == COMMITTED
validation.status == PASS
ledger.status == PASS
compiler orchestration terminal status == PASS
source identity and dialect agree
ledger hash matches exact ledger bytes
canonical hash matches exact canonical bytes
canonical hash matches the decision ledger
committed-bundle verification passes
```

A missing or invalid validation marker means that no bundle is accepted.

## Hash policy

Publication hashes bind to the exact byte arrays written to staging and then moved to the final paths.

The validation report does not contain its own hash or byte length, avoiding recursive self-hash requirements.

Transient lock names, transaction paths, process identifiers, host names and current-clock timestamps do not enter committed artifacts.

## Single-writer and abandoned transactions

The lock is created with exclusive filesystem creation semantics.

An existing lock is never deleted automatically based on age. An operator must determine that no publisher is active before removing it.

A retained same-stem transaction directory indicates incomplete cleanup or an interrupted publication. It blocks the next publication until an operator inspects and resolves it.

## Operator recovery

### Existing lock

Confirm that no publisher is active. Remove the lock only through an explicit operator decision.

### Missing validation marker

Treat canonical and ledger files as uncommitted. Inspect any retained transaction directory for rollback evidence.

### Retained transaction directory

Do not delete it blindly when the validation marker is absent. It may contain the previous committed bundle required for restoration.

When a valid committed marker exists and the committed-bundle verifier passes, a retained transaction directory represents cleanup debt and may be removed after review.

### Publication integrity error

Do not invoke the CII writer. Preserve the output directory and transaction evidence for diagnosis.

### Stale canonical without a committed marker

Do not consume it. A subsequent successful publication will either replace it or remove it according to the new bundle kind.

## Failure semantics

```text
CLI exit 0 = committed and verified PASS
CLI exit 2 = committed and verified expected BLOCKED
CLI exit 1 = publication or integrity failure
```

Unexpected compiler programming errors remain loud and are not converted into ordinary engineering blocks.

## Scope boundaries

This decision does not:

- change profile engineering semantics;
- change canonical XSD or Schematron;
- define the full cross-platform deterministic serialization policy reserved for PR-4;
- change or invoke the production CII writer;
- authorize migration.
