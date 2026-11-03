# XML→CII ANC, Bend Radius, and Support Mapper Custody

## 1. Synthetic ANC root cause

The historical ANC stiffness `9.41952E+19` is `OPEN_END_STIFFNESS` from the XML→CII converter. The source benchmark has `RestrainOpenEnds=Yes`. Before this change the converter formed a degree map using engineering `NodeNumber`; every node with degree exactly 1 and no explicit restraint was assigned a synthetic CII type 1 / ANC restraint with that stiffness.

That rule was too coarse because a degree-1 engineering node occurrence can be physically coincident with another retained branch/continuation occurrence having a different engineering node number.

### New custody rule

`RestrainOpenEnds=Yes` remains honored. A synthetic ANC may be created only when the degree-1 node is also a true physical open end.

A degree-1 node is not treated as a physical open end when another retained node number is coincident within 0.5 mm. Such cases emit:

```text
OPEN_END_ANC_SUPPRESSED node=<n> peers=<...> tol_mm=0.5
```

A synthetic ANC that actually survives into the restraint model emits:

```text
OPEN_END_ANC_CREATED node=<n> basis=true-physical-open-end stiffness=9.419520E+19
```

Explicit source/support restraints are not replaced by this synthetic rule.

## 2. Bend radius authority

Historical CII behavior was incorrect when `<BendRadius>` was absent/zero: the BEND auxiliary writer used one outside diameter as the radius (`1.0D`).

The new Config-phase toggle is:

```text
Bend radius: 1.5D
```

Default is OFF.

### OFF

- enriched XML omits `BendRadius`;
- CII BEND radius field is written as zero;
- CAESAR therefore owns its default bend-radius behavior.

### ON

- only ELBO endpoint-0 bend owners receive `BendRadius`;
- radius is `1.5 * OutsideDiameter`;
- `EffectiveOutsideDiameter` is preferred when available, otherwise raw `OutsideDiameter` is used;
- missing positive OD is blocking (`BEND_RADIUS_1_5D_OD_UNRESOLVED`);
- the CII BEND radius field uses the same explicit `1.5D` rule.

Runtime diagnostics use `BEND_RADIUS_POLICY ...` records.

## 3. Support mapper confidence and precedence

The previous standalone mapper injected:

```text
MDSSUPPTYPE GT* -> GUIDE     priority 5
MDSSUPPTYPE ST* -> LINESTOP  priority 6
```

Those abbreviated rules could run before explicit semantic rules such as `LINE STOP`, which use later priority numbers. This allowed a low-specificity `GT575` code to compete with or pre-empt an explicit line-stop description.

The new policy derives confidence from evidence:

- HIGH (0.98): explicit semantics such as `GUIDE`, `LATERAL GUIDE`, `LINE STOP`, `AXIAL STOP`, `DIRECTIONAL ANCHOR`, `PIPE REST`, `REST`, `SHOE`, `ANCHOR`, `FIXED`;
- MEDIUM (0.75–0.90): longer non-canonical aliases;
- LOW (0.45): short/prefix aliases including `GT`, `ST`, `PG`, `LS`.

A stronger unique kind wins and lower-confidence competing candidates remain in `suppressedCandidates` for audit. Equal-strength conflicting kinds are `ambiguous` and require review.

The injected GT/ST mapping rules are now priority 900/910, after explicit semantic mapping.

Evidence containing `|` is split into separate support occurrences. `NAME=...` is retained as occurrence identity.

For the governing trace:

```text
Pipe Rest ... NAME=/SL-142005.1 ... |
LINE STOP ... NAME=/SL-142005.4 ... MDSSUPPTYPE=GT575 ... CMPSUPGAP=10mm GAP
```

expected audit is:

```text
/SL-142005.1 -> REST     HIGH
/SL-142005.4 -> LINESTOP HIGH
                  GUIDE:GT:LOW retained only as suppressed evidence
```

The support mapper UI now reports occurrence, evidence, chosen kind, CII kind, confidence class, numeric score, matched alias/mode, suppressed candidates, status, and decision basis. Raw audit JSON remains available.

## 4. Qualification boundary

These changes are source-level implementation plus focused local-regression code. They do not by themselves establish deployed-browser or exact frozen-GLRD runtime qualification. The exact branch must still be checked locally and the generated ANC/BEND/support diagnostics inspected before release.
