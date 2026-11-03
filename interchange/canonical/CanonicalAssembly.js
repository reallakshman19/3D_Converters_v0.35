export class CanonicalAssembly {
  constructor({ id, name = '', placement = null, sourceRefs = [], metadata = {} } = {}) {
    this.id = id;
    this.name = name || id;
    this.placement = placement;
    this.sourceRefs = sourceRefs;
    this.metadata = metadata;
    this.nodeIds = [];
    this.segmentIds = [];
    this.componentIds = [];
    this.supportIds = [];
    this.annotationIds = [];
    this.diagnostics = [];
    this.fidelitySummary = null;
  }
}
