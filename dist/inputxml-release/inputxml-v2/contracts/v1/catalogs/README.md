# InputXML Contract Suite v1 — PR-B Catalogs

## Scope

PR-B converts the merged PR-A inventory into normative, machine-readable catalogs. It does not add XSD, Schematron, a canonical compiler, an assurance ledger, or production converter changes.

Authority baseline: `reallaksh19/3D_Converters@9125e8b54ae96fa6a44c6db2cf5408a395fe1575`.

## Artifacts

- `inputxml-field-catalog.json`
- `inputxml-alias-registry.json`
- `inputxml-cii-projection-contract.json`
- `inputxml-component-contract-catalog.json`

## Validated coverage

- 43 grouped field records covering 166 expanded fields and blocks
- 53 explicit or indexed intake-alias instances
- 19 component and auxiliary contracts
- 15 CII projection groups
- all 22 ordered CII sections represented in the projection contract

Validation is enforced by `scripts/validate-inputxml-contract-catalogs.py` and `.github/workflows/inputxml-contract-catalogs.yml`.

## Decisions

1. Canonical pressure attributes are `PRESSURE_C1` through `PRESSURE_C9`; `PRESSURE1` through `PRESSURE9` are intake aliases only.
2. Canonical line identity is `PIPINGELEMENT@LINE`; `LINE_ID` is an intake alias.
3. Canonical geometry never uses the missing sentinel. `FROM_NODE`, `TO_NODE`, and all three deltas are explicit and finite.
4. Inheritance is legal only inside an explicit, ledgered line-context scope. Implicit cross-line carry is forbidden.
5. Source `NUM*` counts are assertions. Canonical counts are recomputed and mismatches block.
6. More than six restraint DOFs on one owner element blocks conversion. No adapter may truncate or renumber without an approved, ledgered reprojection.
7. Known but unprojected engineering fields use `PRESERVE_EXTENSION`; unsupported auxiliary families use `UNSUPPORTED_BLOCKING`.
8. `ALLOWABLESTRESS/CASE` remains blocking until piping-code-specific slot semantics are grounded in authoritative documentation.
9. Component identity cannot be inferred solely from a diameter change, count, or generic route span.
10. Confidence metadata is descriptive and cannot change a blocking status.

## PR-C gate

PR-C may encode only fields and components marked `PROJECTED`, `VALIDATION_ONLY`, or `PRESERVE_EXTENSION`. `UNSUPPORTED_BLOCKING` data may be represented in intake/extension schemas but must fail canonical production validation.
