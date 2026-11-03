# XML CII topology length phase 1

Phase 1 keeps the current XML -> CII enriched XML route intact and introduces a topology-derived `ElementLengthMm` calculator with focused regression coverage.

Scope:

- Calculate route-aware length assignments from current Branch/Node XML.
- Classify support, SREF/reference, bend helper, OLET helper, inline endpoint, and real geometry nodes.
- Prove assignments before and after RIGID endpoint splits.
- Prove the known FLAN -> VALV split case where endpoint 1 receives the incoming gap and endpoint 2 receives the component span.

Out of scope for this phase:

- Generating `_enriched_inputxml.xml`.
- Replacing the current CII worker input contract.
- Changing Python CII worker behavior.
- Implementing the future 3D RVM Viewer API adapter.
