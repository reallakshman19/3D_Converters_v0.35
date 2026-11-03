# Empirical Weight Validation Consumer Boundary

The standalone validation UI is an API consumer only. It must not copy or re-implement the empirical equations or matrix algorithms.

Authoritative computation remains in `converters/empirical-weight/` behind the ES-module API. Consumer regression explicitly rejects A1 model-form tokens in the UI module.
