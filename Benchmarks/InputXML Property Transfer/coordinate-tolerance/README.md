# InputXML Property Transfer Benchmark — Coordinate Tolerance

This benchmark validates a future **Source InputXML → Target InputXML property transfer** tool where the match anchor is coordinate, not node number.

## Dataset

- Source XML: `source_property_master.xml`
- Target XML: `target_geometry.xml`
- Expected result: `expected_transfer_report.csv`
- 24 target elements plus 25 source nodes.
- Component/property sets:
  - PIPE set: `S8810101`, OD 168.3, WT 11.13, Temp1 85, Pressure1 5200.
  - FLANGE set: `P8810306`, OD 114.3, WT 8.56, Temp1 95, Pressure1 6400.
  - VALVE set: `V8810444`, OD 219.1, WT 12.7, Temp1 70, Pressure1 4500.

## Default benchmark config

```text
coordinateToleranceMm = 1.0
coordinateDecimals = 3
diameterMode = strict
diameterToleranceMm = 0.5
lineFamilyMode = strict
lineFamilyRegex = ([A-Z]\d{7})
copySourceSentinels = false
noMatchBehavior = retain target value exactly
```

## Intentional cases

| Case | Target | Expected |
|---|---|---|
| Coordinate tolerance pass | Most rows | Transfer selected node properties |
| Coordinate outside tolerance | `TGT-PIPE-04` | `NO_COORDINATE_MATCH`, retain target values |
| Dia strict block | `TGT-FLANGE-10` | `DIAMETER_MISMATCH_BLOCKED`, retain target values |
| Line-family strict block | `TGT-VALVE-17` | `LINE_FAMILY_MISMATCH_BLOCKED`, retain target values |
| Ambiguous coordinate | `TGT-VALVE-24` | `AMBIGUOUS_COORDINATE_MATCH`, retain target values |
| Source sentinel | Temperature2 = `-100000` on PIPE/VALVE source branches | Skip source sentinel when `copySourceSentinels=false` |

## Safety rule

Unmatched/blocked/ambiguous target nodes must not be changed to zero. Existing target values and CAESAR sentinels must be retained.
