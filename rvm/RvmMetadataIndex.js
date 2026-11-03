export class RvmMetadataIndex {
    constructor(rvmIndex, identityMap) {
        this.rvmIndex = rvmIndex;
        this.identityMap = identityMap;


        // Build a lookup for fast node access by canonicalObjectId
        this._nodesByCanonicalId = new Map();
        if (this.rvmIndex && this.rvmIndex.nodes) {
            for (const node of this.rvmIndex.nodes) {
                this._nodesByCanonicalId.set(node.canonicalObjectId, node);
            }
        }
    }

    // Resolves a renderObjectId (e.g. from mesh pick) to its canonical object ID
    resolveRenderIdToCanonicalId(renderObjectId) {
        if (!this.identityMap) return renderObjectId; // Fallback
        return this.identityMap.canonicalFromRender?.(renderObjectId) || renderObjectId;
    }

    // Returns node record from RvmIndex for a given canonical ID
    getNodeByCanonicalId(canonicalObjectId) {
        return this._nodesByCanonicalId.get(canonicalObjectId) || null;
    }

    // Given a renderObjectId, returns its attributes
    getAttributesByRenderId(renderObjectId) {
        const canonicalId = this.resolveRenderIdToCanonicalId(renderObjectId);
        const node = this.getNodeByCanonicalId(canonicalId);
        return node ? node.attributes : null;
    }

    // Resolves canonicalObjectId to renderObjectIds for scene selection
    renderIdsFromCanonical(canonicalObjectId) {
        if (!this.identityMap) return [canonicalObjectId];
        return this.identityMap.renderIdsFromCanonical?.(canonicalObjectId) || [canonicalObjectId];
    }

    // Renders key/value table into el
    renderAttributesPanel(el, node) {
        if (!el) return;
        el.innerHTML = '';
        if (!node || !node.attributes) {
            el.innerHTML = '<div class="rvm-empty-attrs">No attributes available</div>';
            return;
        }

        const pdmsHighlightFields = new Set(['ZONE', 'SPEC', 'NPD', 'PIPE_NAME', 'ELEMENT_TYPE']);

        const table = document.createElement('table');
        table.className = 'rvm-attr-table';


        const tbody = document.createElement('tbody');

        for (const [key, value] of Object.entries(node.attributes)) {
            const tr = document.createElement('tr');
            if (pdmsHighlightFields.has(key)) {
                tr.classList.add('rvm-attr-highlight');
            }

            const tdKey = document.createElement('td');
            tdKey.textContent = key;
            tdKey.className = 'rvm-attr-key';

            const tdValue = document.createElement('td');
            tdValue.textContent = String(value);
            tdValue.className = 'rvm-attr-value';

            tr.appendChild(tdKey);
            tr.appendChild(tdValue);
            tbody.appendChild(tr);
        }

        table.appendChild(tbody);
        el.appendChild(table);
    }
}
