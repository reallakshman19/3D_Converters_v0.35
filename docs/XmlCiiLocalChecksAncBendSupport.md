# Local checks — ANC / Bend Radius / Support Confidence

Owner policy: local checks only; GitHub workflows are not qualification gates.

Run from an exact checkout of `agent/xml-cii-anc-bend-support-confidence`:

```bash
python tests/xml-cii-runtime-custody.test.py
node tests/xml-cii-bend-radius-config-static.test.js
node tests/xml-cii-standalone-support-type-mapper.test.js
```

Then run the frozen GLRD source through standalone XML→CII twice:

1. `bendRadius.publishOnePointFiveD=false`
   - enriched XML contains no `BendRadius`;
   - CII BEND radius first value is zero;
   - inspect `OPEN_END_ANC_SUPPRESSED` and `OPEN_END_ANC_CREATED` lines.
2. `bendRadius.publishOnePointFiveD=true`
   - each ELBO endpoint-0 BendRadius equals `1.5 * OD`;
   - CII BEND radius uses the same value.

For support confidence, retain the governing trace regression and verify `/SL-142005.4` resolves LINESTOP HIGH while `GUIDE:GT:LOW` is only a suppressed candidate.
