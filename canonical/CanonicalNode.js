export class CanonicalNode {
  constructor({ id, assemblyId, position, sourceRefs = [], metadata = {} } = {}) {
    this.id = id;
    this.assemblyId = assemblyId;
    this.position = position || { x: 0, y: 0, z: 0 };
    this.sourceRefs = sourceRefs;
    this.metadata = metadata;
    this.connectedSegmentIds = [];
    this.branchDegree = 0;
    this.diagnostics = [];
  }
}
