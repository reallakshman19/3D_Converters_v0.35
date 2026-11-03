# ADR-001 — Compiler Media and Profile Stage Semantics

## Status

Accepted for the PR-2 compiler state-machine increment.

Where the stage order in section 6 of the governing concept differs, this ADR is the binding implementation clarification.

## Context

The governing concept originally listed `DIALECT_RESOLVED` before `SOURCE_PARSED`. That order cannot truthfully describe every supported medium:

- XML requires a secure minimum parse before root-based dialect detection.
- JSON requires decoding and parsing before its dialect can be recognized.
- PDF can be recognized from its byte signature before profile-specific text extraction.
- Authoritative profile parsing and topology resolution occur after dialect selection.

A single generic `SOURCE_PARSED` stage would therefore conflate minimum media parsing with authoritative profile resolution.

## Decision

The implemented orchestration sequence is:

```text
INITIALIZED
  -> CONTRACT_BUNDLE_VERIFIED
  -> SOURCE_ENVELOPE_CREATED
  -> MEDIA_INSPECTED
  -> DIALECT_RESOLVED
  -> PROFILE_INTAKE_VALIDATED
  -> PROFILE_RESOLVED
  -> SOURCE_ACCOUNTED
  -> CANONICAL_CANDIDATE_BUILT
  -> XSD_VALIDATED
  -> SCHEMATRON_VALIDATED
  -> LEDGER_VALIDATED
  -> PRODUCTION_ACCEPTED
```

The stages mean:

- `SOURCE_ENVELOPE_CREATED`: source bytes, hash, identity and ledger context exist.
- `MEDIA_INSPECTED`: byte-level media classification has completed. This does not claim that XML or JSON parsing succeeded.
- `DIALECT_RESOLVED`: any secure minimum XML or JSON parse required for dialect detection has succeeded and one registered dialect is selected.
- `PROFILE_INTAKE_VALIDATED`: the selected profile is executable and its declared intake policy permits resolver invocation.
- `PROFILE_RESOLVED`: the registered profile resolver returned one standardized resolver outcome.
- `SOURCE_ACCOUNTED`: profile source accounting completed sufficiently to continue with a candidate.
- `CANONICAL_CANDIDATE_BUILT`: a candidate exists and decision-ledger reconciliation completed.

Profile-specific parsing, PDF extraction, topology construction and source reconciliation occur inside the transition to `PROFILE_RESOLVED`; they are not represented as a second generic parse stage.

## Blocking gates

Expected failures use the stage authority and one stable gate taxonomy:

```text
CONTRACT_BUNDLE_GATE
SOURCE_ENVELOPE_GATE
MEDIA_INSPECTION_GATE
DIALECT_GATE
PROFILE_INTAKE_GATE
PROFILE_RESOLVER_GATE
SOURCE_ACCOUNTING_GATE
XSD_GATE
SCHEMATRON_GATE
LEDGER_GATE
PRODUCTION_ACCEPTANCE_GATE
```

A completed stage is recorded only after its required work succeeds.

## Consequences

- XML and JSON parsing required for detection is reported before `DIALECT_RESOLVED`.
- PDF signature recognition does not imply successful PDF extraction.
- Resolver outcomes cannot declare final production acceptance.
- `completedStages`, `blockedAt` and orchestration transitions share one state authority.
- Artifact publication and optional CII projection remain future states and are not implemented by PR-2.
