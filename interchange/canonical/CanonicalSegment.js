import { FidelityClass } from './FidelityClass.js';

export class CanonicalSegment {
  constructor({
    id,
    assemblyId,
    fromNodeId,
    toNodeId,
    graphRole = 'RUN',
    nominalBore = null,
    od = null,
    wall = null,
    material = '',
    lineRef = '',
    rawAttributes = {},
    derivedAttributes = {},
    normalized = {},
    sourceRefs = [],
    fidelity = FidelityClass.NORMALIZED_LOSSLESS,
    metadata = {},
  } = {}) {
    this.id = id;
    this.assemblyId = assemblyId;
    this.fromNodeId = fromNodeId;
    this.toNodeId = toNodeId;
    this.graphRole = graphRole;
    this.nominalBore = nominalBore;
    this.od = od;
    this.wall = wall;
    this.material = material;
    this.lineRef = lineRef;
    this.rawAttributes = rawAttributes;
    this.derivedAttributes = derivedAttributes;
    this.normalized = normalized;
    this.sourceRefs = sourceRefs;
    this.fidelity = fidelity;
    this.metadata = metadata;
    this.diagnostics = [];
  }
}
