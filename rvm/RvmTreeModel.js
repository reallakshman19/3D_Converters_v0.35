export class RvmTreeModel {
    constructor(rvmIndex, viewerContext) {
        this.rvmIndex = rvmIndex;
        this.viewerContext = viewerContext;

        this._rootNodes = [];
        this._treeMap = new Map();      // canonicalId -> tree node obj
        this._checkboxMap = new Map();  // canonicalId -> checkbox element
        this._liMap = new Map();        // canonicalId -> li element
        this._parentMap = new Map();    // canonicalId -> parent canonicalId
        this._allChecked = false;        // lazy-tree check-all state
    }

    build() {
        this._rootNodes = [];
        this._treeMap.clear();
        this._checkboxMap.clear();
        this._liMap.clear();
        this._parentMap.clear();
        this._allChecked = false;

        if (!this.rvmIndex || !this.rvmIndex.nodes) return;

        for (const node of this.rvmIndex.nodes) {
            this._treeMap.set(node.canonicalObjectId, {
                canonicalObjectId: node.canonicalObjectId,
                name: node.name || node.canonicalObjectId,
                kind: node.kind,
                parentCanonicalObjectId: node.parentCanonicalObjectId,
                children: []
            });
        }

        for (const [, treeNode] of this._treeMap) {
            if (treeNode.parentCanonicalObjectId) {
                const parent = this._treeMap.get(treeNode.parentCanonicalObjectId);
                if (parent) {
                    parent.children.push(treeNode);
                    this._parentMap.set(treeNode.canonicalObjectId, treeNode.parentCanonicalObjectId);
                } else {
                    this._rootNodes.push(treeNode);
                }
            } else {
                this._rootNodes.push(treeNode);
            }
        }
    }

    getDescendantCanonicalIds(canonicalObjectId, includeSelf = false) {
        const result = [];
        const treeNode = this._treeMap.get(canonicalObjectId);
        if (!treeNode) return result;

        const visit = (node) => {
            result.push(node.canonicalObjectId);
            for (const child of node.children) visit(child);
        };

        if (includeSelf) {
            visit(treeNode);
        } else {
            for (const child of treeNode.children) visit(child);
        }
        return result;
    }

    // ── Private helpers ──────────────────────────────────────────────────────

    _getAllCheckedIds() {
        if (this._allChecked) return Array.from(this._treeMap.keys());
        const ids = [];
        for (const [id, cb] of this._checkboxMap) {
            if (cb && cb.checked) ids.push(id);
        }
        return ids;
    }

    _updateAncestorStates(canonicalObjectId) {
        let id = this._parentMap.get(canonicalObjectId);
        while (id) {
            const parentCb = this._checkboxMap.get(id);
            const treeNode = this._treeMap.get(id);
            if (parentCb && treeNode) {
                const desc = this.getDescendantCanonicalIds(id, false);
                const total = desc.length;
                const checked = desc.filter(d => this._checkboxMap.get(d)?.checked).length;
                if (checked === 0) {
                    parentCb.checked = false;
                    parentCb.indeterminate = false;
                } else if (checked === total) {
                    parentCb.checked = true;
                    parentCb.indeterminate = false;
                } else {
                    parentCb.checked = false;
                    parentCb.indeterminate = true;
                }
            }
            id = this._parentMap.get(id);
        }
    }

    _syncToViewer() {
        const allChecked = this._getAllCheckedIds();
        const v = this.viewerContext?.viewer;
        if (!v) return;
        if (allChecked.length === 0) {
            v.clearSelection?.();
        } else {
            v.selectCanonicalIds?.(allChecked);
        }
    }

    // ── Public API ───────────────────────────────────────────────────────────

    checkAll() {
        this._allChecked = true;
        for (const [, cb] of this._checkboxMap) {
            if (cb) { cb.checked = true; cb.indeterminate = false; }
        }
        this._syncToViewer();
    }

    uncheckAll() {
        this._allChecked = false;
        for (const [, cb] of this._checkboxMap) {
            if (cb) { cb.checked = false; cb.indeterminate = false; }
        }
        this._syncToViewer();
    }

    expandAll() {
        for (const [, li] of this._liMap) {
            if (li) li.classList.add('rvm-tree-expanded');
        }
        this._liMap.forEach((li, id) => {
            if (li) {
                const toggle = li.querySelector(':scope > .rvm-tree-label > .rvm-tree-toggle');
                if (toggle) toggle.textContent = '▼';
            }
        });
    }

    collapseAll() {
        for (const [, li] of this._liMap) {
            if (li) li.classList.remove('rvm-tree-expanded');
        }
        this._liMap.forEach((li) => {
            if (li) {
                const toggle = li.querySelector(':scope > .rvm-tree-label > .rvm-tree-toggle');
                if (toggle) toggle.textContent = '▶';
            }
        });
    }

    /** Sync checkbox visual state from an external id set (e.g. viewer selection). */
    setSelectedCanonicalIds(ids) {
        this._allChecked = false;
        const selectedSet = new Set(ids);
        for (const [id, cb] of this._checkboxMap) {
            if (!cb) continue;
            const isChecked = selectedSet.has(id);
            cb.checked = isChecked;
            cb.indeterminate = false;
        }
        for (const [id, li] of this._liMap) {
            if (li && li.classList) {
                li.classList.toggle('is-checked', selectedSet.has(id));
                li.classList.remove('is-indeterminate');
            }
        }
        // Recompute indeterminate for all parents
        for (const [id] of this._treeMap) {
            if (!this._parentMap.has(id)) {
                // It's a root — update ancestors of all checked descendants
            }
        }
        for (const [id, cb] of this._checkboxMap) {
            if (!cb || !this._treeMap.get(id)?.children?.length) continue;
            const desc = this.getDescendantCanonicalIds(id, false);
            if (!desc.length) continue;
            const checked = desc.filter(d => selectedSet.has(d)).length;
            if (checked > 0 && checked < desc.length) {
                cb.checked = false;
                cb.indeterminate = true;
                const li = this._liMap.get(id);
                if (li && li.classList) {
                    li.classList.add('is-indeterminate');
                    li.classList.remove('is-checked');
                }
            }
        }
    }

    clearSelection() {
        this._allChecked = false;
        for (const [, cb] of this._checkboxMap) {
            if (cb) { cb.checked = false; cb.indeterminate = false; }
            }
        for (const [, li] of this._liMap) {
            li?.classList?.remove('is-checked', 'is-indeterminate');
        }
    }

    renderTree(containerEl) {
        if (!containerEl) return;
        containerEl.innerHTML = '';

        if (this._rootNodes.length === 0) {
            containerEl.innerHTML = '<div class="rvm-tree-empty">No hierarchy available</div>';
            return;
        }

        const ul = document.createElement('ul');
        ul.className = 'rvm-tree-root';

        // Expand root nodes by default so the first level is visible
        for (const root of this._rootNodes) {
            ul.appendChild(this._renderTreeNode(root, 0));
        }

        containerEl.appendChild(ul);
    }

    _renderTreeNode(treeNode, depth) {
        const li = document.createElement('li');
        li.className = 'rvm-tree-node';
        li.dataset.id = treeNode.canonicalObjectId;
        this._liMap.set(treeNode.canonicalObjectId, li);

        const labelDiv = document.createElement('div');
        labelDiv.className = 'rvm-tree-label';

        if (treeNode.children.length > 0) {
            const toggleSpan = document.createElement('span');
            toggleSpan.className = 'rvm-tree-toggle';
            // Expand root and first child level by default
            const startExpanded = depth < 2;
            toggleSpan.textContent = startExpanded ? '▼' : '▶';
            if (startExpanded) li.classList.add('rvm-tree-expanded');

            toggleSpan.onclick = (e) => {
                e.stopPropagation();
                const expanded = li.classList.toggle('rvm-tree-expanded');
                toggleSpan.textContent = expanded ? '▼' : '▶';
                if (expanded) this._ensureChildrenRendered(treeNode, li, depth + 1);
            };
            labelDiv.appendChild(toggleSpan);
        } else {
            const spacerSpan = document.createElement('span');
            spacerSpan.className = 'rvm-tree-spacer';
            labelDiv.appendChild(spacerSpan);
        }

        const checkbox = document.createElement('input');
        checkbox.className = 'rvm-tree-checkbox';
        checkbox.type = 'checkbox';
        this._checkboxMap.set(treeNode.canonicalObjectId, checkbox);

        checkbox.onclick = (e) => {
            e.stopPropagation();
            this._allChecked = false;
            const isChecked = checkbox.checked;

            // Cascade to all descendants
            const descendants = this.getDescendantCanonicalIds(treeNode.canonicalObjectId, false);
            for (const id of descendants) {
                const cb = this._checkboxMap.get(id);
                if (cb) { cb.checked = isChecked; cb.indeterminate = false; }
            }

            // Clear this node's indeterminate state
            checkbox.indeterminate = false;

            // Update ancestor indeterminate/checked states
            this._updateAncestorStates(treeNode.canonicalObjectId);

            this._syncToViewer();
        };

        labelDiv.appendChild(checkbox);

        const textSpan = document.createElement('span');
        textSpan.className = 'rvm-tree-text';
        const kind = String(treeNode.kind || '').trim();
        textSpan.textContent = kind && kind !== 'UNKNOWN'
            ? `[${kind}] ${treeNode.name}`
            : treeNode.name;

        // Click on label text = single-select in viewer (or toggle if ctrl/meta pressed)
        labelDiv.onclick = (e) => {
            e.stopPropagation();
            if (this.viewerContext?.viewer) {
                if (e.ctrlKey || e.metaKey) {
                    this.viewerContext.viewer.toggleCanonicalId?.(treeNode.canonicalObjectId);
                } else {
                    this.viewerContext.viewer.selectByCanonicalId?.(treeNode.canonicalObjectId);
                }
            }
        };

        labelDiv.appendChild(textSpan);
        li.appendChild(labelDiv);

        if (treeNode.children.length > 0 && li.classList.contains('rvm-tree-expanded')) {
            this._ensureChildrenRendered(treeNode, li, depth + 1);
        }

        return li;
    }

    _ensureChildrenRendered(treeNode, li, childDepth) {
        if (!treeNode?.children?.length || !li || li.dataset.childrenRendered === 'true') return;
        const ul = document.createElement('ul');
        ul.className = 'rvm-tree-children';
        for (const child of treeNode.children) {
            ul.appendChild(this._renderTreeNode(child, childDepth));
        }
        li.appendChild(ul);
        li.dataset.childrenRendered = 'true';
    }

    dispose() {
        this._rootNodes = [];
        this._treeMap.clear();
        this._checkboxMap.clear();
        this._liMap.clear();
        this._parentMap.clear();
        this._allChecked = false;
        this.rvmIndex = null;
        this.viewerContext = null;
    }
}
