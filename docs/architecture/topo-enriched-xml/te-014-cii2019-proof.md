# TE-014 — Strict PSI116 Canonical Intake and CII(2019) Proof

TE-014 consumes one accepted `TopoEnrichedXmlProductionResult.v1` in `ENFORCED` mode. The selected production bundle must be explicitly `selectable=true` both at the production-result root and inside the accepted selection artifact.

## Remediation invariants

Adjacent source nodes define one canonical `PIPINGELEMENT`. Every emitted occurrence receives an explicit role and section claim:

```text
OUTGOING_ENDPOINT_OWNER → ELEMENTS_FROM and eligible BEND/RIGID/RESTRANT
INCOMING_ELEMENT_OWNER → ELEMENTS_TO and eligible BEND/RIGID/RESTRANT
TOPOLOGY_ONLY_ENDPOINT → omission only when payload-free
```

A branch-start occurrence can own the outgoing element only when it is source-branch index zero, `Endpoint=0`, has accepted TE-013 role `ARRIVE`, and has an accepted component projection rule. Shared element ownership is section-scoped: one incoming/base owner, and no duplicate singleton `BEND` or `RIGID` owner.

`ELBO`, `VALV`, `FLAN`, `ATTA`, bend, rigid, restraint/support, non-zero SIF, weight, bend radius, or other mandatory engineering content without an explicit element/section claim blocks with `PSI116_UNPROJECTABLE_ENGINEERING_CONTENT`.

Every source entity that owns a logical topology edge must also own at least one TE-013 emitted or reserved occurrence. A reduced sequence/record subset cannot be certified while its source edge remains in the accepted topology index.

## HYDRO_PRESSURE authority

PSI116 has no hydrostatic-test pressure field. Canonical `HYDRO_PRESSURE="0"` is a policy-normalized explicit absence, not a parser fallback:

```text
value:                  0 pascal
authority:              TE014_POLICY_EXPLICIT_ABSENCE_OF_HYDROSTATIC_TEST_CASE
source disposition:     PSI116_SOURCE_CONTRACT_HAS_NO_HYDRO_PRESSURE_FIELD
projection disposition: NORMALIZE_EXPLICIT_ABSENCE
fallbackAllowed:        false
```

The value, authority, disposition, and policy hash are recorded for every canonical element.

## Required proof

- Real Branch A `ELBO` reaches canonical `BEND` and independently reparsed CII evidence.
- Adjacent `VALV` reaches `RIGID` on the same element through non-conflicting section ownership.
- Branch-start bend, rigid, restraint, and support payloads are covered.
- Isolated `ELBO`, `VALV`, `FLAN`, and `ATTA` block.
- Only payload-free topology endpoints may be omitted.
- Edge-owned source topology without an occurrence disposition blocks.
- `selectable=false` blocks independently of historical TE-013 bundle hashes.
- Node-number mismatches, unaccounted occurrences, conflicting claims, and unexplained losses are zero for PASS.

## Validation policy

GitHub Actions is not a TE-014 evidence authority. Workflows may be absent or disabled for repository-credit management. The remediation disposition relies on exact accepted-base scope comparison, local focused/adversarial and protected test execution, deterministic artifact comparison, and independent semantic review.

The governing semantic comparison baseline remains `ba8b4e43698e1bed8e30f25832659603b40e86b2`. Pull-request targeting of `main` is administrative and must not silently redefine that accepted implementation baseline.
