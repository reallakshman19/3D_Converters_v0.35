export class RvmVisibilityController {
    constructor(modelGroup, identityMap) {
        this.modelGroup = modelGroup;
        this.identityMap = identityMap;


        // Track the current state
        this._hiddenCanonicalIds = new Set();
        this._isolatedCanonicalIds = new Set();
    }

    updateModelGroup(modelGroup) {
        this.modelGroup = modelGroup;
        // Re-apply visibility state to the new model
        this._applyVisibility();
    }

    isolate(canonicalIds) {
        this._isolatedCanonicalIds = new Set(canonicalIds);
        this._hiddenCanonicalIds.clear();
        this._applyVisibility();
    }


    isolateByRenderIds(renderIds) {
        if (!this.identityMap) {
            // Fallback: isolate strictly by match
            this.modelGroup.traverse((obj) => {
                if (obj.isMesh) {
                    const matchName = obj.userData?.name || obj.name || obj.uuid;
                    obj.visible = renderIds.includes(matchName);
                }
            });
            return;
        }


        // Attempt to find canonical IDs from render IDs
        // Usually, the identity map goes source -> canonical -> renderIds
        // This is a naive reverse map lookup for fallback if needed.
        // It's cleaner to use the actual identity Map.
        const isolatedCanons = [];
        // (Assuming a way to resolve renderId -> canonicalId exists, else fallback loop)
        this.isolate(isolatedCanons);
    }

    showAll() {
        this._hiddenCanonicalIds.clear();
        this._isolatedCanonicalIds.clear();
        this._applyVisibility();
    }

    hide(canonicalIds) {
        for (const id of canonicalIds) {
            this._hiddenCanonicalIds.add(id);
        }
        this._isolatedCanonicalIds.clear();
        this._applyVisibility();
    }

    show(canonicalIds) {
        const ids = Array.isArray(canonicalIds) ? canonicalIds.filter(Boolean) : [];
        if (!ids.length) return this.showAll();
        const isolatedMode = this._isolatedCanonicalIds.size > 0;
        for (const id of ids) {
            this._hiddenCanonicalIds.delete(id);
            if (isolatedMode) this._isolatedCanonicalIds.add(id);
        }
        this._applyVisibility();
    }

    getHiddenCanonicalIds() {
        return Array.from(this._hiddenCanonicalIds);
    }

    getIsolatedCanonicalIds() {
        return Array.from(this._isolatedCanonicalIds);
    }

    getVisibilityState() {
        return {
            hiddenCanonicalIds: this.getHiddenCanonicalIds(),
            isolatedCanonicalIds: this.getIsolatedCanonicalIds(),
            hiddenCount: this._hiddenCanonicalIds.size,
            isolatedCount: this._isolatedCanonicalIds.size,
            isolatedMode: this._isolatedCanonicalIds.size > 0,
        };
    }

    _applyVisibility() {
        if (!this.modelGroup) return;

        const isIsolatedMode = this._isolatedCanonicalIds.size > 0;


        // Let's resolve all valid renderIds for hidden/isolated
        const hideRenderIds = new Set();
        const isolateRenderIds = new Set();

        if (this.identityMap) {
            for (const cId of this._hiddenCanonicalIds) {
                const renderIds = this.identityMap.renderIdsFromCanonical(cId) || [];
                renderIds.forEach(r => hideRenderIds.add(r));
            }
            for (const cId of this._isolatedCanonicalIds) {
                const renderIds = this.identityMap.renderIdsFromCanonical(cId) || [];
                renderIds.forEach(r => isolateRenderIds.add(r));
            }
        } else {
             // Treat canonicalId as renderId directly if no map
             for (const cId of this._hiddenCanonicalIds) hideRenderIds.add(cId);
             for (const cId of this._isolatedCanonicalIds) isolateRenderIds.add(cId);
        }

        this.modelGroup.traverse((obj) => {
            if (obj.isMesh) {
                const name = obj.userData?.name || obj.name || obj.uuid;


                if (isIsolatedMode) {
                    obj.visible = isolateRenderIds.has(name);
                } else {
                    obj.visible = !hideRenderIds.has(name);
                }
            }
        });
    }

    dispose() {
        this._hiddenCanonicalIds.clear();
        this._isolatedCanonicalIds.clear();
    }
}
