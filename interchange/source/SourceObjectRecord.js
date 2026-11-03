export class SourceObjectRecord {
  constructor({ id, objectType, rawAttributes = {}, sourceRefs = [], metadata = {} } = {}) {
    this.id = id;
    this.objectType = objectType;
    this.rawAttributes = rawAttributes;
    this.sourceRefs = sourceRefs;
    this.metadata = metadata;
  }
}
