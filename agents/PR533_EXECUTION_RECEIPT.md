# PR533 — Exact-Blob Execution Receipt

## Scope

Focused execution of the independent KD-3 qualification oracle R1. This receipt is **not** native KD320 qualification and does not establish Code/design authority.

## Exact branch content custody

Published GitHub blob hashes were compared against the local execution workspace. The qualification catalog files matched exactly:

```text
source-ledger.json  eb985d16484db727d20dce17ac65cf294aaed188
requirements.json   fa4ca61ebe7409ee6184ab62301d8cd5948363d9
catalog.json        0644b31d9e014bb5c3c4eefbffacfb797652aea2
README.md           4eb1aa7f9ab54c0798e787f2eaa055668c64651d
```

Executable/test blobs used:

```text
audit-b313-ch9-kd3-oracle.mjs
  34135a7869218345c6a0fc6c31ebd2a5e8658050
solve-b313-ch9-kd3-qualification-foundation.mjs
  362d54c1d165513043a1ad093ad85f878f34f4fd
b313-chapter-ix-kd3-qualification-oracle.test.mjs
  8474071614ed2aaac568db7ed92da65ffc42d6f9
```

The audit source was specifically reconstructed to the exact GitHub blob after a connector string-escaping difference was detected during custody checking.

## Executed commands

```text
node --test tests/b313-chapter-ix-kd3-qualification-oracle.test.mjs
node scripts/audit-b313-ch9-kd3-oracle.mjs
node scripts/solve-b313-ch9-kd3-qualification-foundation.mjs
```

## Results

```text
Focused Node tests
  tests = 9
  pass  = 9
  fail  = 0

Oracle audit
  ok = true
  sources = 7
  requirements = 17
  cases = 23
  foundationReady = 7
  pendingNative = 14

Foundation solver
  ok = true
  qualificationOnly = true
  productionKernelUsed = false
  nativeKd320Executed = false
```

Key independent analytical comparison:

```text
KD3-QF-001
expected Salt = 63.299495811 MPa
actual Salt   = 63.29949581051363 MPa
relative difference = 7.683576249643195e-12
```

Other frozen foundation vectors cover zero range/zero damage, one-block Miner, multi-block Miner, cycle-order invariance, very small usage and usage near unity.

## Authority boundary

```text
NATIVE_CORE_KD320 = NOT_QUALIFIED / BLOCKED
NATIVE_KD320_EXECUTED = FALSE
PRODUCTION_KERNEL_USED = FALSE
CODE_COMPLIANCE = FALSE
DESIGN_AUTHORITY = FALSE
```

The remaining native cases intentionally retain `expected = null` until controlled-source and independent-oracle admission is complete.