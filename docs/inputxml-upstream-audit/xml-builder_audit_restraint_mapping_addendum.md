# XML Builder audit addendum — duplicate restraint mappings

Baseline reviewed: `fc43c4df40793f7437aca7ab06dcf50b5edacb99`

## F13 — Shared core duplicates and contradicts the authoritative restraint map

`tabs/model-converters/xml-cii-node-to-inputxml-core.js` contains a local map:

```text
+Y → 17
Y → 17
LIM → 12
GUI → 9
ANC / ANCHOR → 0
```

This contradicts both:

- `converters/scripts/xml_to_cii2019.py::_restraint_type_to_code()`; and
- its explicit JavaScript mirror, `converters/xml-cii2019-core/restraint-type-codes.js`.

The Python implementation documents and applies:

```text
+Y → 14
-Y → 17
GUI → 8
LIM → 9
ANC / ANCHOR → 1
bare X → 17
bare Y → 19
bare Z → 18
```

Signed axes use their literal CAESAR II codes. Bare axes use the XML XYZ → CII X,Z,-Y frame mapping.

The Python converter is the source of truth for the numeric restraint codes written downstream. The shared JavaScript module is intentionally maintained as its mirror.

## Approved correction

1. Delete the private `RESTRAINT_TYPE_MAP` from the node-to-InputXML core.
2. Import and use `restraintTypeToCaesarCode()` for both explicit Type and Direction fallback.
3. Preserve the existing priority: recognized/numeric Type first, then recognized/numeric Direction.
4. Update regression evidence from `+Y → 17` to the authoritative `+Y → 14`.
5. Add a guard proving the core no longer defines a private restraint map.

This correction changes only restraint type-code authority. It does not alter geometry, slot count, stiffness, gap, friction, neutral-file formatting, or topology behavior.
