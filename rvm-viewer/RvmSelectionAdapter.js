import * as THREE from 'three';
import { emit } from '../core/event-bus.js';
import { RuntimeEvents } from '../contracts/runtime-events.js';

const COLORS = { SELECTED: 0x2244cc, SEARCH_RESULT: 0x884400 };

export class RvmSelectionAdapter {
  constructor(modelGroup, camera, domElement, identityMap) {
    this.modelGroup = modelGroup;
    this.camera = camera;
    this.domElement = domElement;
    this.identityMap = identityMap;
    this._selectedCanonicalId = null;
    this._selectedCanonicalIds = [];
    this._selectedRenderIds = [];
    this._originalMaterials = new Map();
    this._lastIntersections = [];
    this._lastNonSelectableHit = null;
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this._onPointerDown = this._onPointerDown.bind(this);
    this.domElement.addEventListener('pointerdown', this._onPointerDown);
  }
  updateModelGroup(modelGroup) { this.clearSelection(); this.modelGroup = modelGroup; this._originalMaterials.clear(); this._lastIntersections = []; this._lastNonSelectableHit = null; }
  _onPointerDown(event) {
    if (event.button !== 0) return;
    const rect = this.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const hits = this.raycaster.intersectObject(this.modelGroup, true);
    this._lastIntersections = hits.slice(0, 24).map((hit) => this._intersectionSummary(hit));
    const additive = event.ctrlKey || event.shiftKey || event.metaKey;
    const hit = hits.find((item) => item?.object?.visible && this._isRenderableObject(item.object) && this._isSelectableObject(item.object));
    if (hit) {
      const renderId = this._renderIdFor(hit.object);
      if (renderId) { this._handlePick(renderId, additive); return; }
    }
    const diagnostic = hits.find((item) => item?.object?.visible && !this._isSelectableObject(item.object));
    this._lastNonSelectableHit = diagnostic ? this._intersectionSummary(diagnostic) : null;
    if (this._lastNonSelectableHit && !additive) { emit(RuntimeEvents.RVM_NODE_SELECTED, { canonicalId: null, canonicalIds: [], renderObjectIds: [], diagnosticHit: this._lastNonSelectableHit }); return; }
    if (!additive) { this.clearSelection(); emit(RuntimeEvents.RVM_NODE_SELECTED, { canonicalId: null, canonicalIds: [], renderObjectIds: [] }); }
  }
  _isRenderableObject(object) { return Boolean(object?.isMesh || object?.isLine || object?.isLineSegments || object?.isPoints); }
  _isSelectableObject(object) { const data = object?.userData || {}; return data.pickable !== false && data.selectable !== false && !data.nonSelectableReason; }
  _renderIdFor(object) {
    const data = object?.userData || {};
    return String(data.renderObjectId || data.leafRenderObjectId || object?.uuid || data.canonicalId || data.name || object?.name || '').trim();
  }
  _intersectionSummary(hit) { const object = hit?.object || {}; const data = object.userData || {}; return { distance: Number(hit?.distance || 0), name: object.name || '', uuid: object.uuid || '', renderId: this._renderIdFor(object), renderKind: data.renderKind || data.effectivePrimitive || data.effectiveRenderPrimitive || data.renderPrimitive || '', sourcePath: data.sourcePath || data.browserRvmProperties?.sourcePath || data.browserRvmProperties?.SourcePath || '', canonicalId: data.canonicalId || data.name || object.name || object.uuid || '', pickable: data.pickable !== false, selectable: data.selectable !== false, nonSelectableReason: data.nonSelectableReason || '' }; }
  _handlePick(renderId, additive = false) { const canonicalId = this.identityMap?.canonicalFromRender?.(renderId) || renderId; this.selectByRenderObjectId(renderId, canonicalId, { additive }); }
  selectByRenderObjectId(renderId, canonicalId = renderId, options = {}) {
    if (!renderId) return;
    if (!options.additive) this.clearSelection();
    if (options.additive && this._selectedRenderIds.includes(renderId)) {
      this._selectedRenderIds = this._selectedRenderIds.filter((id) => id !== renderId);
      this._selectedCanonicalIds = this._selectedCanonicalIds.filter((id) => id !== canonicalId);
    } else {
      this._selectedRenderIds = options.additive ? [...this._selectedRenderIds, renderId] : [renderId];
      this._selectedCanonicalIds = options.additive ? [...new Set([...this._selectedCanonicalIds, canonicalId])] : [canonicalId];
    }
    this._selectedCanonicalId = this._selectedCanonicalIds[0] || null;
    this._restoreMaterials();
    this._highlight(this._selectedRenderIds, COLORS.SELECTED);
    this._emitSelection();
  }
  selectByCanonicalId(canonicalId) { this.clearSelection(); this._selectedCanonicalId = canonicalId; this._selectedCanonicalIds = [canonicalId]; this._selectedRenderIds = this.identityMap?.renderIdsFromCanonical?.(canonicalId) || [canonicalId]; this._highlight(this._selectedRenderIds, COLORS.SELECTED); this._emitSelection(); }
  selectCanonicalIds(ids, options = {}) { if (!options.additive) this.clearSelection(); for (const id of ids) if (!this._selectedCanonicalIds.includes(id)) this._selectedCanonicalIds.push(id); this._selectedCanonicalId = this._selectedCanonicalIds[0] || null; this._rebuildRenderIds(); this._highlight(this._selectedRenderIds, COLORS.SELECTED); this._emitSelection(); }
  toggleCanonicalId(id) { const index = this._selectedCanonicalIds.indexOf(id); if (index >= 0) this._selectedCanonicalIds.splice(index, 1); else this._selectedCanonicalIds.push(id); this._selectedCanonicalId = this._selectedCanonicalIds[0] || null; this._restoreMaterials(); this._rebuildRenderIds(); this._highlight(this._selectedRenderIds, COLORS.SELECTED); this._emitSelection(); }
  _rebuildRenderIds() { this._selectedRenderIds = []; for (const id of this._selectedCanonicalIds) this._selectedRenderIds.push(...(this.identityMap?.renderIdsFromCanonical?.(id) || [id])); }
  _emitSelection() { emit(RuntimeEvents.RVM_NODE_SELECTED, { canonicalId: this._selectedCanonicalId, canonicalIds: [...this._selectedCanonicalIds], renderObjectIds: [...this._selectedRenderIds] }); }
  getSelectedCanonicalId() { return this._selectedCanonicalId; }
  getSelectedCanonicalIds() { return [...this._selectedCanonicalIds]; }
  getLastPickIntersections() { return [...this._lastIntersections]; }
  getLastNonSelectableHit() { return this._lastNonSelectableHit ? { ...this._lastNonSelectableHit } : null; }
  highlightSearchResults(canonicalIds) { const renderIds = []; for (const id of canonicalIds) renderIds.push(...(this.identityMap?.renderIdsFromCanonical?.(id) || [id])); this._highlight(renderIds, COLORS.SEARCH_RESULT); }
  clearSelection() { this._restoreMaterials(); this._selectedCanonicalId = null; this._selectedCanonicalIds = []; this._selectedRenderIds = []; }
  getSelectionRenderIds() { return this._selectedRenderIds; }
  _highlight(renderIds, color) { const set = new Set(renderIds); this.modelGroup?.traverse?.((obj) => { if (this._isRenderableObject(obj) && this._isSelectableObject(obj) && set.has(this._renderIdFor(obj))) this._setEmissive(obj, color); }); }
  _setEmissive(mesh, color) { const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]; const id = this._renderIdFor(mesh); if (!this._originalMaterials.has(id)) this._originalMaterials.set(id, materials.map((m) => (m?.emissive ? m.emissive.getHex() : null))); for (const mat of materials) if (mat?.emissive) mat.emissive.set(color); }
  _restoreMaterials() { this.modelGroup?.traverse?.((obj) => { if (!this._isRenderableObject(obj)) return; const id = this._renderIdFor(obj); const originals = this._originalMaterials.get(id); if (!originals) return; const materials = Array.isArray(obj.material) ? obj.material : [obj.material]; materials.forEach((mat, index) => { if (mat?.emissive && originals[index] !== null) mat.emissive.setHex(originals[index]); }); }); this._originalMaterials.clear(); }
  dispose() { this.clearSelection(); this.domElement.removeEventListener('pointerdown', this._onPointerDown); }
}
