# BM_CII ISONOTE Restraint Validation

Restraint records are record-scoped. Carry-forward is not applied to supports/restraints.

## Summary

| Status | Count |
|---|---:|
| total | 4 |
| MISSING_IN_INPUTXML | 2 |
| PASS | 2 |

## Node-wise Results

### Node 35 — MISSING_IN_INPUTXML

ISONOTE: `:/PS-123 :ISONOTE 'REST(28kN), GUIDE(6kN),LINE STOP(15kN)'`

Parsed intents: REST, GUIDE, LINE_STOP

Actual restraints:
- REST / +Y / axis=VERTICAL / cosine=VERTICAL AXIS / render=REST
- AXIS_RESTRAINT / X / axis=AXIAL / cosine=X / render=AXIS_PAIR_X
- AXIS_RESTRAINT / Z / axis=AXIAL / cosine=Z / render=AXIS_PAIR_Z

| Intent | Status | Remark |
|---|---|---|
| REST | PASS | REST present in InputXML restraint records. |
| GUIDE | MISSING_IN_INPUTXML | ISONOTE expects GUIDE but no GUIDE family was found. |
| LINE_STOP | MISSING_IN_INPUTXML | ISONOTE expects LINE STOP but no LINE_STOP/LIMIT family was found. |

### Node 130 — PASS

ISONOTE: `:ISONOTE 'REST NOT DEFINED, SINGLE AXIS Z'`

Parsed intents: REST_NOT_DEFINED, SINGLE_AXIS_Z

Actual restraints:
- LINE_STOP / +Z / axis=AXIAL / cosine=+Z / render=LINESTOP

| Intent | Status | Remark |
|---|---|---|
| REST_NOT_DEFINED | PASS | ISONOTE says REST NOT DEFINED and no REST family is present. |
| SINGLE_AXIS_Z | PASS | Single-axis Z intent has an explicit Z-axis restraint record. |

### Node 255 — PASS

ISONOTE: `:ISONOTE 'REST(3kN), GUIDE(1kN)'`

Parsed intents: REST, GUIDE

Actual restraints:
- GUIDE / GUIDE / axis=LATERAL / cosine=AS PER NODE DATA / render=GUIDE
- REST / +Y / axis=VERTICAL / cosine=VERTICAL AXIS / render=REST

| Intent | Status | Remark |
|---|---|---|
| REST | PASS | REST present in InputXML restraint records. |
| GUIDE | PASS | GUIDE present in InputXML restraint records. |

### Node 205 — MISSING_IN_INPUTXML

ISONOTE: `:/PS-456 :ISONOTE 'REST(10kN), HOLDDOWN,LINE STOP(6kN), Holddown without Guide Can Spring'`

Parsed intents: REST, GUIDE, LINE_STOP, HOLDDOWN, SPRING_WARNING

Actual restraints:
- LIMIT / LIM / axis=AXIAL / cosine=AXIAL TO PIPE / render=LIMIT
- REST / Y / axis=VERTICAL / cosine=VERTICAL AXIS / render=REST
- HANGER / SPRING / HANGER / axis=LATERAL / VERTICAL HANGER / cosine=VERTICAL AXIS / render=SPRING

| Intent | Status | Remark |
|---|---|---|
| REST | PASS | REST present in InputXML restraint records. |
| GUIDE | MISSING_IN_INPUTXML | ISONOTE expects GUIDE but no GUIDE family was found. |
| LINE_STOP | PASS | LINE STOP intent is covered by LINE_STOP/LIMIT restraint. |
| HOLDDOWN | NEEDS_ENGINEERING_REVIEW | ISONOTE mentions HOLDDOWN; InputXML has HANGER/SPRING. Verify holddown/spring modelling basis. |
| SPRING_WARNING | NEEDS_ENGINEERING_REVIEW | ISONOTE spring warning retained for engineering review. |
| WARNING | NEEDS_ENGINEERING_REVIEW | ISONOTE contains spring-related warning text. Requires engineering review. |

