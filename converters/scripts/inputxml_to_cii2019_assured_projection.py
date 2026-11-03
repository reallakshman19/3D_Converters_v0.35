#!/usr/bin/env python3
"""Compatibility entrypoint for the field-catalog assured projection controller.

The merged PR-F implementation remains in
``inputxml_to_cii2019_assured_projection_legacy.py``. This wrapper changes only
one control-flow detail: the optional exact-ID ownership pre-pass must not let a
strict canonical preflight exception escape before the core creates its blocked
projection ledger.
"""
from __future__ import annotations

import inputxml_to_cii2019_assured_projection_legacy as _legacy

_original_bind_exact_canonical_element_ids = _legacy._bind_exact_canonical_element_ids


def _bind_exact_canonical_element_ids(assurance, canonical_xml):
    try:
        return _original_bind_exact_canonical_element_ids(assurance, canonical_xml)
    except _legacy.ProjectionBlocked:
        # The core projection call immediately performs the same strict canonical
        # preflight inside its fail-closed ledger-producing boundary. Returning no
        # optional ownership notes here preserves that blocked-ledger contract.
        return {}


_legacy._bind_exact_canonical_element_ids = _bind_exact_canonical_element_ids

for _name in dir(_legacy):
    if _name.startswith("__"):
        continue
    globals()[_name] = getattr(_legacy, _name)

# Re-expose the corrected helper after the compatibility export loop.
globals()["_bind_exact_canonical_element_ids"] = _bind_exact_canonical_element_ids


if __name__ == "__main__":
    raise SystemExit(_legacy.main())
