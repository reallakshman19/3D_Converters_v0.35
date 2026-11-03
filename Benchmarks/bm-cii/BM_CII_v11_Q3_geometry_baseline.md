# BM_CII v11 Q3 Geometry Baseline

Status: **frozen geometry baseline**

This baseline freezes the BM_CII geometry counts after:

- bounds-coherence QC passed
- geometry tally QC v2 passed
- trace identity QC v3 passed
- all geometry nodes reached 100% trace coverage

Optimization is **not allowed** to change geometry counts until visual acceptance is complete.

## Frozen variants

| Variant | Support source | Geometry nodes | Trace coverage | Component traces | Support traces | Annotation traces |
|---|---|---:|---:|---:|---:|---:|
| engineering_inputxml | InputXML | 205 | 100% | 148 | 49 | 2 |
| engineering_isonote | ISONOTE | 203 | 100% | 148 | 47 | 2 |
| temp1_inputxml | InputXML | 205 | 100% | 148 | 49 | 2 |
| temp1_isonote | ISONOTE | 203 | 100% | 148 | 47 | 2 |

## Frozen semantic category counts

| Variant | Pipe | Bend | Valve | Flange | Tee/Olet | Support | Axis | Annotation | Other |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| engineering_inputxml | 16 | 63 | 36 | 18 | 14 | 49 | 6 | 2 | 1 |
| engineering_isonote | 16 | 63 | 36 | 18 | 14 | 47 | 6 | 2 | 1 |
| temp1_inputxml | 16 | 63 | 36 | 18 | 14 | 49 | 6 | 2 | 1 |
| temp1_isonote | 16 | 63 | 36 | 18 | 14 | 47 | 6 | 2 | 1 |

## Baseline gate command

```bash
node scripts/bm-cii/check-q3-geometry-baseline.mjs \
  --summary BM_CII_v11_q3_trace_geometry_qc.summary.json \
  --baseline benchmarks/bm-cii/BM_CII_v11_Q3_geometry_baseline.json \
  --strict
```

## Visual acceptance gate before optimization

The geometry baseline is frozen, but the model is not yet release-accepted until manual visual review passes.

Required screenshot review:

1. Full pipe route visible in fit view.
2. Supports/restraints visible and attached to pipe nodes.
3. InputXML variant uses InputXML support source only.
4. ISONOTE variant uses ISONOTE support source only.
5. Four ISONOTE callouts visible near the model, not detached from plant geometry.
6. No 1000x annotation scale jump.
7. No pipe collapse at origin.
8. No major branch, tee/olet, valve, flange, or bend missing.
9. No black rectangle annotation panels.
10. No yellow sphere-only annotation regression.

Manual decision values:

```text
VISUAL_ACCEPTANCE = PASS | FAIL
VISUAL_ACCEPTANCE_REVIEWER = <name>
VISUAL_ACCEPTANCE_SCREENSHOT = <artifact path or issue link>
```

## Optimization lock

Do not optimize triangles, hints, draw calls, or annotation style until this visual acceptance gate passes.

Allowed before visual acceptance:

- classifier corrections
- metadata corrections
- QC script corrections
- report formatting corrections

Not allowed before visual acceptance:

- reducing geometry
- removing support objects
- changing pipe/component topology
- changing annotation placement logic
- changing scale transforms
