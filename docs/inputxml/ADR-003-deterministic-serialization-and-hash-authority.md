# ADR-003 — Deterministic Serialization and Hash Authority

## Status

Accepted for the PR-4 implementation.

## Context

PR-3 guarantees that the bytes selected for publication are the bytes written, but a hash is meaningful only when the byte representation itself is governed. XML namespace history, attribute insertion order, numeric lexical forms, JSON mapping insertion order, diagnostic discovery order, process hash seed and platform newline behavior can otherwise produce different bytes for equivalent compiler outcomes.

## Decision

The compiler uses the versioned policy:

```text
InputXmlDeterministicSerializationPolicy.v1
inputxml-deterministic-serialization-v1
```

The runtime policy is stored at:

```text
contracts/inputxml/v1/compiler/inputxml-deterministic-serialization.json
```

The policy is part of the pre-parse runtime contract bundle. Missing, duplicate-key, unknown, incomplete or runtime-incompatible policy content blocks at `CONTRACT_BUNDLE_GATE`.

### XML authority

Canonical XML is serialized as UTF-8 with an XML declaration, LF line endings, one trailing newline and deterministic indentation.

The namespace authorities are:

```text
default namespace: COADE
extension namespace: urn:reallaksh19:inputxml:extension:v1
extension prefix: ext
```

Canonical attributes follow explicit element-scoped order. The lists cover root, model, piping element and supported auxiliary families. Unknown unqualified attributes on canonical elements are policy drift and fail closed. Approved extension attributes use lexical QName order. Foreign namespaces fail closed.

Canonical numeric fields use fixed-point `Decimal` formatting. Non-finite values, locale commas and exponent output are prohibited. Trailing zeros are removed and negative zero becomes `0`. Lexical identifiers, node IDs, labels, tags and GUIDs are not numerically rewritten.

Comments and processing instructions are not part of canonical output.

Child order is preserved. `PIPINGELEMENT`, branch, component, auxiliary and evidence sequence is not sorted merely to obtain a stable hash.

> Determinism does not authorize reordering engineering-significant sequences.

### JSON authority

Ledger and validation JSON use UTF-8, two-space indentation, sorted object keys, non-ASCII text preserved, LF line endings, no trailing newline and `allow_nan=False`.

Arrays retain their contract order.

### Ledger and diagnostics

Decision records retain authoritative append order. Record IDs are assigned from that deterministic append sequence.

Diagnostics are ordered by:

```text
compiler stage
severity rank
code
source entity identity
normalized context
message
```

The same ordered diagnostic collection is used by ledger and validation evidence.

### Hash authorities

```text
sourceHashSha256:
SHA-256 of raw uploaded source bytes

canonicalHashSha256:
SHA-256 of deterministic canonical XML bytes

ledger publication hash:
SHA-256 of deterministic ledger JSON bytes

validation:
self-hash and self-byte-length excluded

serialization policy digest:
SHA-256 of normalized compact policy JSON
```

The policy identity and digest are included in the verified contract bundle, ledger, validation publication metadata and committed-bundle verification evidence.

> Exact hash equality is meaningful only under the same declared serialization-policy identity.

### Publication integration

The PR-3 publisher receives canonical, ledger and validation bytes from the shared serialization authority. It does not reimplement XML or JSON formatting. Validation remains the final commit marker. Same-stem locking, same-filesystem staging, rollback, stale-canonical removal and verification remain unchanged.

### Contract-gate failure

When the contract bundle, including the serialization policy, cannot be verified, the compiler may publish a `BLOCKED` no-candidate evidence bundle using the existing bootstrap JSON representation. That bundle contains no claim of verified serialization-policy authority.

## Compatibility

Engineering values, profile decisions, XSD rules, Schematron rules and the production CII writer are unchanged.

Representation-only changes include canonical attribute order, fixed numeric lexical forms, normalized namespaces, deterministic diagnostic order and policy metadata. Accepted fixtures must retain identical XSD, Schematron, assurance, CII projection and independent CII reparse outcomes.

## Cross-platform proof

Focused deterministic tests run on Ubuntu and Windows. Separate subprocesses use `PYTHONHASHSEED=1`, `PYTHONHASHSEED=2` and `PYTHONHASHSEED=random` and must produce identical hashes.
