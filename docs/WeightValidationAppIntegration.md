# Weight Validation App Integration

The standalone Weight Match phase exposes a read-only empirical validation report that consumes the reusable ES-module API from `converters/empirical-weight/index.js`.

## Consumer boundary

The app does not duplicate Approach 1 equations or Approach 2 matrix algorithms. All empirical computation remains behind the API. Existing Weight Match candidate/rating/length/semantic matching remains legacy application logic and is not represented as having been replaced by the empirical API.

## Validation scope

The report validates **resolved component weights** from the shared Weight Match computation. `Build report` uses the existing `xml-cii-weight-validator-ready` event and retains resolved-weight provenance where available.

It does not validate the weight master against itself. Approach 1 and Approach 2 are evaluated independently. Exact lookup is excluded.

Approach 2 additionally uses **leave-target-cell-out validation by default**: for the component TypeDesc + size + rating + target being checked, the matching target master cell is removed from the A2 validation catalog before matrix reconstruction. This prevents a master-derived resolved weight from partially validating itself through the target cell. Neighboring sizes/ratings remain available.

The operational abnormality rule is:

```text
Deviation % = (Resolved kg - Empirical estimate kg) / Empirical estimate kg * 100
```

Exactly ±30% is accepted. Only absolute deviation greater than 30% is reported abnormal.

## Outputs

- abnormal-only app table;
- abnormal-only CSV;
- full audit JSON;
- deterministic validation evidence ZIP containing report JSON, abnormal CSV, and manifest.

The latest report is retained as `stateRef.current.empiricalWeightValidationReport`; the ZIP manifest is retained as `stateRef.current.empiricalWeightValidationEvidenceManifest` for later evidence-package reconciliation.

## Authority boundary

The report is `READ_ONLY_VALIDATION_NOT_WEIGHT_AUTHORITY`. It does not write source XML weight, Weight Match, `RigidMatch1`, `Rigidmatch2`, or CII output.
