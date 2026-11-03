import { FidelityClass } from './FidelityClass.js';

export class CanonicalSupport {
  constructor({
    id,
    assemblyId,
    hostRefType = 'INFERRED',
    hostRef = null,
    hostRefConfidence = 0,
    rawAttributes = {},
    derivedAttributes = {},
    normalized = {},
    directionSource = 'UNKNOWN',
    classificationSource = 'UNKNOWN',
    sourceRefs = [],
    fidelity = FidelityClass.RECONSTRUCTED,
    exportHints = {},
    metadata = {},
  } = {}) {
    this.id = id;
    this.assemblyId = assemblyId;
    this.hostRefType = hostRefType;
    this.hostRef = hostRef;
    this.hostRefConfidence = hostRefConfidence;
    this.rawAttributes = rawAttributes;
    this.derivedAttributes = derivedAttributes;
    this.normalized = normalized;
    this.directionSource = directionSource;
    this.classificationSource = classificationSource;
    this.sourceRefs = sourceRefs;
    this.fidelity = fidelity;
    this.exportHints = exportHints;
    this.metadata = metadata;
    this.diagnostics = [];
  }
}
