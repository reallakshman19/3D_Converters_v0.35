# PR564 input-semantics continuation addendum

This addendum supplements `agents/PR564_workreport.md` after the user-directed re-ground of `Advanced_Analysis@16d1e58f728e72b04b761c02dce682aa189779f2/docs/EI data`.

## Corrected source finding

The earlier statement that the structured repository had no Type-selection transcription was too broad. The exact linked tree contains:

- Appendix D worked-example transcription blob `c050cd90802c27241c510c6f0ac43bfaf7a89e9d`, explicitly labeling Type 1–4 and applying T3-2/T3-4/T3-5/T3-8 respectively;
- P0 SBC transcription blob `5312c9e2cf86af9e940ba722fcbee64702aeccd3`, including Type-3 synthesis references T3-5/T3-6/T3-7/T3-9.

Both blobs are byte-identical to the earlier `76eb4bd...` content pins. The `16d1e58...` commit is therefore an additional custody point, not an independent engineering source. A complete automatic four-way Type-inference rule is still not frozen or authorized.

## Completed #563 slice

Added:

```text
converters/vibration/sbc/input-semantics.js
docs/vibration/SBC-Input-Semantics-Reference-v1.md
tests/vibration-sbc-input-semantics.test.mjs
```

Updated:

```text
converters/vibration/sbc/source-trace.js
docs/vibration/SBC-source-trace-register-v1.md
```

Repository backup CLI executed on exact pre-edit bytes:

```text
backup #4 source-trace.js old blob = 90b2897b394155641071f2dfb9cd1613a743cc42 PASS
backup #5 source register old blob = 24e323b8d9b094aaf6694d399372bef1ecd6390d PASS
```

New `SBC-UNIT-001..013` records capture reference-only semantics for nominal diameter, branch/span lengths, fitting/valve evidence, location/support context and Type-2/Type-4 topology confirmation. They explicitly retain:

```text
engineeringQualificationEstablished = false
numericalMethodUseAllowed            = false
engineeringDefaultAllowed            = false
automaticClassificationAllowed       = false
```

No fitting factor, schedule substitution, score, table value, curve value, equation, LOF arithmetic, benchmark expected value or authority promotion was added.

## Validation

Executed against published-byte-matched reconstruction:

```text
node --test tests/vibration-sbc-reserved-scaffold.test.mjs
PASS 9/9

node --test tests/vibration-sbc-reserved-scaffold.test.mjs tests/vibration-sbc-controlled-structure.test.mjs tests/vibration-sbc-type-contracts.test.mjs tests/vibration-sbc-input-semantics.test.mjs
PASS 26/26
```

The first aggregate attempt after publication exposed only a test-file formatting hash mismatch; local formatting was changed to the exact published blob `2005e7818fe3981cd6e645972799cf5da7fd6730` and the full suite was rerun PASS 26/26. No byte-parity claim is based on the mismatched copy.

## Authority remains unchanged

```text
lifecycle            = RESERVED
calculationState     = BLOCKED
qualificationState   = BLOCKED
productionExecution  = FORBIDDEN
benchmarkExecution   = FORBIDDEN
screeningAuthority   = NOT_AUTHORIZED
designAuthority      = false
T3 curve activation  = false
```

## NEXT ACTION

Remain within #563 controlled-source reconciliation. Obtain/reconcile the exact controlled-PDF locator and independently reviewed method text for the complete Type-selection and numerical input/unit conversion rules. Only source rules actually reconciled to the controlled PDF may advance toward `FROZEN`; unknown rules remain `NOT_FROZEN`. Do not start numerical kernels, use D7 for calibration, activate T3 curves, alter lifecycle, or use #546/#508 as implementation baselines.
