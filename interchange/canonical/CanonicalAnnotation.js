import { FidelityClass } from './FidelityClass.js';

export class CanonicalAnnotation {
  constructor({
    id,
    assemblyId,
    annotationType,
    anchorType = 'INFERRED',
    anchorRef = null,
    anchorConfidence = 0,
    rawAttributes = {},
    derivedAttributes = {},
    normalized = {},
    text = '',
    sourceRefs = [],
    fidelity = FidelityClass.RECONSTRUCTED,
    exportHints = {},
    visibilityPolicy = { visibleByDefault: true },
    metadata = {},
  } = {}) {
    this.id = id;
    this.assemblyId = assemblyId;
    this.annotationType = annotationType;
    this.anchorType = anchorType;
    this.anchorRef = anchorRef;
    this.anchorConfidence = anchorConfidence;
    this.rawAttributes = rawAttributes;
    this.derivedAttributes = derivedAttributes;
    this.normalized = normalized;
    this.text = text;
    this.sourceRefs = sourceRefs;
    this.fidelity = fidelity;
    this.exportHints = exportHints;
    this.visibilityPolicy = visibilityPolicy;
    this.metadata = metadata;
    this.diagnostics = [];
  }
}
