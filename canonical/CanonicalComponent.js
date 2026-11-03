import { FidelityClass } from './FidelityClass.js';

export class CanonicalComponent {
  constructor({
    id,
    assemblyId,
    type,
    anchorNodeIds = [],
    hostSegmentIds = [],
    rawAttributes = {},
    derivedAttributes = {},
    normalized = {},
    sourceRefs = [],
    fidelity = FidelityClass.RECONSTRUCTED,
    metadata = {},
  } = {}) {
    this.id = id;
    this.assemblyId = assemblyId;
    this.type = type;
    this.anchorNodeIds = anchorNodeIds;
    this.hostSegmentIds = hostSegmentIds;
    this.rawAttributes = rawAttributes;
    this.derivedAttributes = derivedAttributes;
    this.normalized = normalized;
    this.sourceRefs = sourceRefs;
    this.fidelity = fidelity;
    this.metadata = metadata;
    this.diagnostics = [];
  }
}
