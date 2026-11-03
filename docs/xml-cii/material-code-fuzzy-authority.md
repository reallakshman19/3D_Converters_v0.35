# Material → CII Material Code Authority

## Governing authority order

Material Code is resolved in this order:

1. explicit Material-scoped Material Code override;
2. manual Material text entered in Preview;
3. exact Process Line List `Material` column for the resolved line key;
4. Material Map resolution from that Material text;
5. Piping Class fallback only when Process Material is blank;
6. unresolved / review.

A nonblank Process Material that cannot be resolved does **not** fall through to a Piping Class guess. The Material Code remains blank and any stale scoped code is reported as a conflict.

## Material-text problem

Material text and CII Material Code were previously resolved through exact, suffix, and containment comparisons. A saved Material Code override could win even when Process Material carried stronger contradictory engineering evidence.

Example:

```text
Process Material: ASTM A790 UNS S31803
Saved code:       193  (A358-304CL1)
Expected code:    338  (A790 duplex grade entry)
```

The supplied Material Map currently spells the code-338 entry as `A790-S32803`. The resolver treats `S32803` as a known master alias for engineering designation `S31803` while preserving A789/A790 specification discrimination.

## Material identity model

Each material is decomposed into normalized surface text, specification family, grade/designation, canonical aliases, and alphanumeric evidence tokens.

## Material Map match hierarchy

1. Surface exact: `1.000`.
2. Specification + canonical grade exact: `0.995`.
3. Curated known master alias with exact specification: `0.980`.
4. Grade exact where one side lacks a specification: `0.930`.
5. Same specification and one-character grade distance: `0.900`.
6. Token/Dice fuzzy comparison: accepted only above threshold and only with adequate winning margin.

Defaults:

```text
acceptance threshold:          0.86
override correction threshold: 0.92
ambiguity margin:              0.04
```

Weak and ambiguous results remain review-required.

## Override policy

- A Material Code explicitly keyed to the Material identity is a pinned user decision and is preserved; conflicts remain visible for review.
- A class-, line-, branch-, or class-size-scoped Material Code override is validated against Process Material.
- Strong, unique Process Material evidence corrects a conflicting stale scoped override.
- A nonblank unresolved Process Material blocks Piping Class fallback and clears an incompatible scoped code.
- Consistent overrides are retained.

## Piping Class fallback policy

Piping Class is never primary Material authority. It is consulted only when Process Material is blank.

Before wildcard-family matching, the resolver reads the configured **Rating prefix mapping** and removes a recognized one- or two-character prefix. The longest configured prefix wins.

Examples with the default Rating mapping:

```text
61033M1  → Rating prefix 6  → material family 1033M1
61234X2  → Rating prefix 6  → material family 1234X2
11504R1  → Rating prefix 1  → material family 1504R1
151033M1 → Rating prefix 15 → material family 1033M1
```

The residual material family is then matched against the configured `?` or `??` family pattern. A wildcard is rejected when the leading token is not present in Rating prefix mapping.

Therefore:

```text
61033M1 → 106 / ASTM A106-B  only when Process Material is blank
61234X2 → 106 / ASTM A106-B  only when Process Material is blank
11504R1 → 177 / ASTM A333-6  only when Process Material is blank
71033M1 → no wildcard fallback when prefix 7 is not configured
```

Wildcard fallback remains review-required.

## Preview and run authority

Material Code authority is applied after bore/wall authority and before Rating authority. Standalone run parity consumes the corrected Preview row, so the same Process Material and Material Code are written into enriched XML.

## Weight Match Rating

Weight Match consumes Preview Rating snapshot schema v2. The live displayed Preview table is primary, with normalized branch, line+bore, line+class, and unambiguous line-key matching. Rating is not re-derived in normal Weight Match mode.
