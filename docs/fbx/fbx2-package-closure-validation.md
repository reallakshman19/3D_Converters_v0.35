# FBX2 selected-zone package closure validation

## Gate

`FBX-SELECTED-ZONE-PACKAGE-001` is an additive package-closure gate. It does not alter selected-zone geometry selection or StagedJSON semantic authority.

A package closure is emitted only when:

- the benchmark executed exactly two runs;
- the benchmark comparison status is `PASS`;
- terminal-disposition coverage status is `PASS`;
- both branch ledgers have the same digest;
- both package audits have the same package digest;
- both `FBXZPKG1` archives have the same SHA-256.

## Bound evidence

The package audit inventories these four roles exactly once:

```text
BRANCH_MATCH_LEDGER
GLOBAL_OCCURRENCE_INDEX
CROSS_ZONE_SUPPORT_ASSOCIATION_EVIDENCE
COORDINATE_PROFILE
```

They are either all present or all explicitly omitted. Partial closure sets are invalid.

## Support boundary

A passing cross-zone support association must be ledger-bound, source-index-bound and host-bound. The source occurrence must remain assigned outside the selected zone. Its support geometry must not appear in the selected-zone manifest. The host must be a PIPE record in the same managed branch.

This gate does not authorize restraint subtype, connectivity, engineering attributes or SUPPORT publication to StagedJSON.

## Qualification status

Synthetic and contract gates validate deterministic archive construction, tamper rejection, schema validity, branch ordering and support-boundary enforcement. Real-source qualification remains dependent on execution of the exact governed archives on a functioning runner. A hosted job that terminates before step 1 does not close that release-evidence dependency.
