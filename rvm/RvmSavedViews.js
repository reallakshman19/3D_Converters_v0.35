import { state, saveStickyState } from '../core/state.js';

const SCHEMA_VERSION = 'rvm-saved-view/v1';

export class RvmSavedViews {
  constructor(activeBundleId) {
    this.bundleId = activeBundleId;
    this.views = new Map();

    if (state.rvm.savedViews && Array.isArray(state.rvm.savedViews)) {
      for (const view of state.rvm.savedViews) {
        if (view.bundleId === this.bundleId) {
          this.views.set(view.id, view);
        }
      }
    }
  }

  saveView(viewer, id = null) {
    id = id || `VIEW-${Date.now()}`;
    const viewData = viewer.getSavedView();

    const view = {
      schemaVersion: SCHEMA_VERSION,
      id,
      bundleId: this.bundleId,
      camera: viewData.camera || {},
      projection: viewData.projection || 'perspective',
      navMode: viewData.navMode || 'orbit',
      sectionState: viewData.sectionState || null,
      hiddenCanonicalObjectIds: viewData.hiddenCanonicalObjectIds || [],
      isolatedCanonicalObjectIds: viewData.isolatedCanonicalObjectIds || [],
      selectedCanonicalObjectId: viewData.selectedCanonicalObjectId || null,
      overlayMode: viewData.overlayMode || { tags: true, attributes: false }
    };

    this.views.set(id, view);
    this._persist();
    return view;
  }

  loadView(viewer, id) {
    const view = this.views.get(id);
    if (!view) {
      return false;
    }
    viewer.setSavedView(view);
    return true;
  }

  getView(id) {
    return this.views.get(id) || null;
  }

  getAllViews() {
    return Array.from(this.views.values());
  }

  deleteView(id) {
    if (this.views.has(id)) {
      this.views.delete(id);
      this._persist();
      return true;
    }
    return false;
  }

  _persist() {
    state.rvm.savedViews = this.getAllViews();
    saveStickyState();
  }
}
