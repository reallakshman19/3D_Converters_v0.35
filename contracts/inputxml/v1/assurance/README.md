# InputXML → CII Assurance Ledger v1

`InputXmlCiiAssuranceLedger.v1` is the PR-E readiness artifact between canonical InputXML and the future production-writer adapter.

It combines:

- `InputXmlCanonicalizationDecisionLedger.v1`;
- `InputXmlCanonicalValidation.v1`;
- canonical InputXML identity and field coverage;
- optional `TopologyTraceLedger.v1`;
- optional `TopologyParityReport.v1`;
- the PR-B field catalog and CII projection contract.

## Core invariant

PR-E may identify one or more target CII sections, but it must not invent a CII record index. Every record therefore carries:

```json
{
  "sections": ["ELEMENTS"],
  "ciiIndex": null,
  "indexStatus": "PENDING_WRITER_ADAPTER"
}
```

The index can become non-null only after a later writer-projection phase proves the emitted CII section/index and byte or semantic parity.

## Gates

A PASS ledger requires:

1. canonicalization status PASS;
2. canonical XSD/Schematron validation PASS;
3. canonical XML bytes matching the compiler ledger hash;
4. every InputXML element identity resolving in the canonical document;
5. no fabricated CII index;
6. 1.00 identity, topology, and CII-projection confidence for READY records;
7. when topology artifacts are supplied, a complete trace/parity pair with matching hash anchors and zero parity mismatches;
8. no orphan topology source entity or unmapped canonical element;
9. no blocking or deferred disposition.

## Coverage modes

- `FIELD_LEVEL` — exact canonical element or attribute path is ledgered.
- `ENTITY_LEVEL` — source entity maps to an explicit canonical InputXML element ID.
- `EVIDENCE_ONLY` — preserved evidence intentionally has no CII projection.
- `UNTRACED` — insufficient ancestry; blocks unless the source record is already blocking.

## CLI

```bash
python scripts/inputxml_assurance_ledger.py \
  --canonical-xml output.canonical.input.xml \
  --canonicalization-ledger output.canonicalization-ledger.json \
  --canonical-validation output.canonical-validation.json \
  --field-catalog contracts/inputxml/v1/catalogs/inputxml-field-catalog.json \
  --projection-contract contracts/inputxml/v1/catalogs/inputxml-cii-projection-contract.json \
  --output output.inputxml-cii-assurance-ledger.json
```

Topology-backed compilation additionally supplies:

```text
--topology-trace-ledger topology-trace-ledger.json
--topology-parity-report topology-parity-report.json
```

The CLI exits `0` for PASS and `2` for BLOCKED or invalid input.
