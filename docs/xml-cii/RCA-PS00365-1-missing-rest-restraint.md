# RCA — Missing staged REST restraint on PS00365.1

## Reported evidence

The enriched source XML node for `PS00365.1` was resolved through staged JSON position authority and contained `DTXR_POS`, `DTXR_PS`, and `DTXR_SOURCE`, but no `<Restraint>` block. JSON Trace reported `Derived Restraints = REST`, and the raw staged object declared `SUPPORT_TYPE`, `SUPPORT_KIND`, and `SUPPORT_MAPPER_KIND` as `REST`.

## Root cause

The base enrichment path successfully:

1. indexed the staged support;
2. matched the XML node by position;
3. resolved the support kind as `REST`;
4. converted `REST` through the shared profile to XML `+Y`;
5. built the target restraint entries.

The final write gate admitted newly derived restraints only when the XML node `ComponentType` was `ATTA`. `PS00365.1` is `ANCI` and had no existing restraint, so the already-resolved REST entry was discarded. `DTXR_POS` was used correctly; the defect was after resolution, at XML restraint-carrier admission.

## Correction

Standalone DTXR enrichment now uses the authoritative ledger source paths to recover support kinds from the exact matched staged JSON objects. When all of the following are true:

- XML carrier is `ANCI` or `ATTA`;
- uploaded XML has no existing `<Restraint>`;
- staged JSON or ledger authority resolves `REST`;
- JSON restraint mapping is enabled;

it materializes the shared REST profile (`+Y`) through `applyXmlRestraints`.

Existing uploaded restraints are never replaced by this fallback. Non-REST supports and non-support component types are unchanged.

## Sample acceptance

For `PS00365.1`, raw staged `SUPPORT_KIND = REST` is recovered through the ledger source path even when raw `DTXR` is blank. The enriched XML gains a REST restraint equivalent to:

```xml
<Restraint>
  <Type>+Y</Type>
  <Stiffness>1.751270E+12</Stiffness>
  <Gap>0</Gap>
  <Friction>0.3</Friction>
  <DirectionCosineX>0.000000000</DirectionCosineX>
  <DirectionCosineY>1.000000000</DirectionCosineY>
  <DirectionCosineZ>0.000000000</DirectionCosineZ>
</Restraint>
```

Exact numeric formatting follows the active shared support-mapping configuration.

## Validation

Focused isolated execution:

```text
10 passed
0 failed
```

The tests cover raw staged `PS00365.1` REST evidence, ANCI materialization, existing-restraint preservation, JSON-restraint disable, non-REST exclusion, non-support exclusion, and shared support-mapping integration.
