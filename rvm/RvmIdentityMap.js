/**
 * RvmIdentityMap — bidirectional lookup between source, canonical, and render IDs.
 *
 * Phase 1: canonicalObjectId === sourceObjectId (no remap). The map layer exists
 * from day one so that tags and saved views write against a stable canonical ID,
 * and Phase 2 remap can be wired without touching consumers.
 */
export class RvmIdentityMap {
  constructor() {
    // sourceObjectId → entry
    this._bySource = new Map();
    // canonicalObjectId → entry
    this._byCanonical = new Map();
    // renderObjectId → canonicalObjectId
    this._byRender = new Map();
  }

  /**
   * Build from an array of node records (from RvmIndex.nodes).
   * Each record must have: sourceObjectId, canonicalObjectId, renderObjectIds[].
   */
  static fromNodes(nodes) {
    const map = new RvmIdentityMap();
    for (const node of nodes) {
      map.add(node);
    }
    return map;
  }

  add(node) {
    const entry = {
      sourceObjectId: node.sourceObjectId,
      canonicalObjectId: node.canonicalObjectId,
      renderObjectIds: Array.isArray(node.renderObjectIds) ? [...node.renderObjectIds] : [],
    };
    this._bySource.set(entry.sourceObjectId, entry);
    this._byCanonical.set(entry.canonicalObjectId, entry);
    for (const rid of entry.renderObjectIds) {
      this._byRender.set(rid, entry.canonicalObjectId);
    }
  }

  /** sourceObjectId → entry | null */
  lookupBySource(sourceObjectId) {
    return this._bySource.get(sourceObjectId) || null;
  }

  /** canonicalObjectId → entry | null */
  lookupByCanonical(canonicalObjectId) {
    return this._byCanonical.get(canonicalObjectId) || null;
  }

  /** renderObjectId → canonicalObjectId | null */
  canonicalFromRender(renderObjectId) {
    return this._byRender.get(renderObjectId) || null;
  }

  /** canonicalObjectId → renderObjectIds[] | [] */
  renderIdsFromCanonical(canonicalObjectId) {
    return this._byCanonical.get(canonicalObjectId)?.renderObjectIds || [];
  }

  get size() {
    return this._byCanonical.size;
  }

  clear() {
    this._bySource.clear();
    this._byCanonical.clear();
    this._byRender.clear();
  }
}
