# FIT EI Worked-Example Traceability v1

Status: **SOURCE + BENCHMARK-TOLERANCE RECONCILIATION — BOUNDED SCREENING QUALIFICATION / DESIGN AUTHORITY FALSE**

Calculation ID: `VIB.FIV.FLOW_TURBULENCE`

## 1. Purpose

This record binds FIT qualification examples to controlled EI evidence and defines the published-value reconciliation policy. It documents the evidence supporting the current bounded screening implementation; it does not expand the declared screening envelope and does not grant design authority.

## 2. Controlled source identities

| Role | Repository / commit | Source | Git blob | Authority use |
|---|---|---|---|---|
| Governing method | `reallaksh19/Common@fb549185b9b27edc2379734240320a85c5bef9f6` | `EI - AVIFF Guidelines 2nd Edition.pdf` | `9d3eccc56429411e17c07a579bdebbd13cb0bdc5` | Governing T2.2 method/applicability source |
| Published worked examples | `reallaksh19/Common@fb549185b9b27edc2379734240320a85c5bef9f6` | `EI - AVIFF Guidelines 2nd Edition_Examples.pdf` | `3e2517d0df527a051084fc02e69cb7afa31f8d47` | Published D2/D4 benchmark values |
| Owner-supplied digitized worked examples | `reallaksh19/Advanced_Analysis@04328852dced9f5c4827da8afe8a82aeb8b1a1d3` | `docs/EI data/EI_AVIFF_Guidelines_2nd_Edition_Examples.md` | `c050cd90802c27241c510c6f0ac43bfaf7a89e9d` | Corroborating transcription of Appendix D worked examples; cannot override governing/published source |
| Owner qualification anchor | `reallaksh19/Common@7bfead910f6bca91b10748ead009e40f20c82219` | `Energy-Institute-AVIFF---Worked-Examples.doc.docx` | `ceee15ed5f7f320045d5f3979024e2e8664613f2` | Controlled worked-example benchmark qualification source |
| Retained workbook | `reallaksh19/CRF-4-1@68dc8e1fa2ef67073c59b3afc56f1bf40953d535` | `Extended calc2/AIV FIV/FIT.xlsm` | `d7d4c1a773fe1b2e9791f258b2b7a07e95bdc41e` | Migration/parity evidence only |

The Owner has directed that successful reproduction of the controlled worked examples is sufficient engineering qualification evidence for FIT; a separate independent vibration-engineer sign-off is not required.

## 3. Source precedence

When values differ:

1. governing EI method PDF controls equations/applicability;
2. EI worked-example PDF controls the published D2/D4 comparison vector;
3. the pinned `Advanced_Analysis` Markdown is an owner-supplied digitized transcription used for fast trace/corroboration and cannot override the PDF;
4. the Owner-pinned DOCX is the qualification anchor and preserves richer/revised scenario evidence;
5. controlled JSON is the executable transcription of the adopted benchmark vector;
6. retained workbook is migration/parity evidence only.

No lower-ranked source silently replaces a higher-ranked method or benchmark value.

## 4. Controlled benchmark mapping

Appendix D Example D2, D.2.1 publishes eight FIT rows. The executable benchmark pack now preserves all eight rows:

| Benchmark | Published configuration | Published LOF | Band |
|---|---|---:|---|
| `EI-D2-FIT-STREAM-4-SUPPLY-COOLER-14IN` | Stream 4, 14 in STD, span 9.9 m | 0.014 | `LOF_LT_0_3` |
| `EI-D2-FIT-STREAM-5-SUCTION-SCRUBBER-14IN` | Stream 5, 14 in STD, span 9.9 m | 0.007 | `LOF_LT_0_3` |
| `EI-D2-FIT-STREAM-6-COMPRESSOR-SUCTION-14IN` | Stream 6, 14 in STD, span 9.9 m | 0.006 | `LOF_LT_0_3` |
| `EI-D2-FIT-STREAM-7-COMPRESSOR-DISCHARGE-8IN` | Stream 7, 8 in SCH120, span 7.3 m | 0.019 | `LOF_LT_0_3` |
| `EI-D2-FIT-RECYCLE-DISCHARGE-8IN` | Recycle discharge, 8 in SCH120, span 7.3 m | 0.019 | `LOF_LT_0_3` |
| `EI-D2-FIT-RECYCLE-SUCTION-6IN` | Recycle suction, 6 in STD, span 6.4 m | 0.276 | `LOF_LT_0_3` |
| `EI-D2-FIT-RELIEF-UPSTREAM-4IN` | Relief upstream, 4 in SCH120, span 5.2 m | 0.338 | `LOF_0_3_TO_LT_0_5` |
| `EI-D2-FIT-RELIEF-DOWNSTREAM-6IN` | Relief downstream, 6 in STD, span 6.4 m | 0.881 | `LOF_0_5_TO_LT_1` |

The existing D4 examples remain in the same benchmark pack:

| Benchmark | Published LOF | Band |
|---|---:|---|
| `EI-D4-FIT-SEPARATOR-INLET-20IN` | 0.26 | `LOF_LT_0_3` |
| `EI-D4-FIT-PRODUCED-WATER-10IN` | 3.15 | `LOF_GE_1` |

The UI keeps `EI-D2-FIT-RECYCLE-SUCTION-6IN` first/default so the established PF-002 browser journey remains unchanged; the other nine rows are additional selectable controlled cases.

## 5. Published-value tolerance reconciliation

Controlled policy:

```text
FIT-EI-PUBLISHED-RECONCILIATION-V1
```

Published Appendix D values include rounded intermediate/output values. Each absolute tolerance is derived independently from the documented equation register applied to the published input vector plus half of the least displayed output increment. Tolerances are not tuned to production output and may not be relaxed merely to obtain a pass.

| Case | Published LOF | Absolute LOF tolerance |
|---|---:|---:|
| D2 Stream 4 supply to cooler | 0.014 | 0.0007 |
| D2 Stream 5 supply to suction scrubber | 0.007 | 0.0006 |
| D2 Stream 6 compressor suction | 0.006 | 0.0009 |
| D2 Stream 7 compressor discharge | 0.019 | 0.0006 |
| D2 recycle discharge | 0.019 | 0.0006 |
| D2 recycle suction | 0.276 | 0.0012 |
| D2 relief upstream | 0.338 | 0.0018 |
| D2 relief downstream | 0.881 | 0.0011 |
| D4 separator inlet | 0.26 | 0.0054 |
| D4 produced water | 3.15 | 0.0070 |

The benchmark artifact itself remains:

```text
engineeringAuthority = BENCHMARK_ONLY
```

That is distinct from the calculated product result, whose bounded qualification is `SCREENING` with `designAuthority=false`.

## 6. D2 mechanical corroboration

The same owner-supplied Appendix D transcription records D.2.4 Mechanical Excitation:

```text
centrifugal compressor LOF = 0.20
electric motor >15 kW LOF = 0.40
governing Mechanical LOF   = 0.40
```

This remains the controlled Mechanical T2.3 benchmark used by the production-freeze journey. FIT and Mechanical remain separate mechanisms/authority paths.

## 7. Owner benchmark-qualification rule

```text
controlled worked-example reproduction PASS
    -> bounded engineering screening qualification evidence satisfied
    -> separate independent vibration-engineer review NOT REQUIRED
```

This rule does not waive the exact release suite, browser/real-file acceptance, QST-003 fail-closed exclusion, or design-authority restrictions.

## 8. Remaining production-freeze gates

The numerical worked-example evidence is sufficient for the current bounded FIT qualification. Remaining freeze work is execution/reproducibility evidence, not equation qualification:

1. execute the exact coordinated release suite on the frozen candidate SHA;
2. execute the unchanged URL-based Chromium PF-001..PF-007 journey in an environment that permits navigation;
3. retain the real screenshots and `VibrationProductionFreezeReceipt.v1`;
4. retain QST-003 (`219.1 < Dext < 273 mm`) as fail-closed unless separately resolved;
5. preserve `designAuthority=false`.

## 9. Authority conclusion

Current bounded FIT state:

```text
qualificationState   = SCREENING
screeningAuthority   = AUTHORIZED_BOUNDED
designAuthority      = false
benchmark authority  = BENCHMARK_ONLY
```

The expanded D2/D4 benchmark set strengthens evidence coverage; it does not widen applicability, change equations, alter action bands, or grant design authority.
