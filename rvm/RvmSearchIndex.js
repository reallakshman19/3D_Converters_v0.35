export class RvmSearchIndex {
    constructor(rvmIndex, identityMap) {
        this.rvmIndex = rvmIndex;
        this.identityMap = identityMap;
        this.indexReady = false;
        this._searchableEntries = []; // Pre-built flat list of searchable objects
        this._buildPromise = null;
    }

    async build() {
        if (this._buildPromise) return this._buildPromise;

        this._buildPromise = new Promise((resolve) => {
            if (!this.rvmIndex || !this.rvmIndex.nodes || this.rvmIndex.nodes.length === 0) {
                this.indexReady = true;
                resolve();
                return;
            }

            const nodes = this.rvmIndex.nodes;
            const total = nodes.length;
            let current = 0;
            const CHUNK_SIZE = 500;

            const processChunk = () => {
                const end = Math.min(current + CHUNK_SIZE, total);
                for (; current < end; current++) {
                    const node = nodes[current];


                    // Build a concatenated searchable string for this node
                    let searchableText = [
                        node.sourceObjectId || '',
                        node.canonicalObjectId || '',
                        node.name || '',
                        node.path || '',
                        node.kind || ''
                    ].join(' ').toLowerCase();

                    if (node.attributes) {
                        for (const [key, val] of Object.entries(node.attributes)) {
                            searchableText += ' ' + key.toLowerCase() + ' ' + String(val).toLowerCase();
                        }
                    }

                    // Pre-resolve render IDs
                    let renderObjectIds = [node.canonicalObjectId];
                    if (this.identityMap) {
                        renderObjectIds = this.identityMap.renderIdsFromCanonical?.(node.canonicalObjectId) || [node.canonicalObjectId];
                    }

                    this._searchableEntries.push({
                        canonicalObjectId: node.canonicalObjectId,
                        name: node.name || node.canonicalObjectId,
                        renderObjectIds: renderObjectIds,
                        kind: node.kind || '',
                        attrs: node.attributes,
                        _text: searchableText
                    });
                }

                if (current < total) {
                    setTimeout(processChunk, 0); // Yield to main thread
                } else {
                    this.indexReady = true;
                    resolve();
                }
            };

            processChunk();
        });

        return this._buildPromise;
    }

    search(query) {
        if (!this.indexReady || !query || typeof query !== 'string') return [];
        const normalizedQuery = query.toLowerCase().trim();
        if (normalizedQuery === '') return [];

        const ranked = [];
        for (let i = 0; i < this._searchableEntries.length; i++) {
            const entry = this._searchableEntries[i];
            const text = entry._text;
            const name = String(entry.name || '').toLowerCase();
            const canonical = String(entry.canonicalObjectId || '').toLowerCase();
            let score = 0;
            if (name === normalizedQuery || canonical === normalizedQuery) score += 100;
            if (name.startsWith(normalizedQuery)) score += 60;
            if (canonical.startsWith(normalizedQuery)) score += 40;
            if (text.includes(normalizedQuery)) score += 20;
            if (score <= 0) continue;
            ranked.push({
                canonicalObjectId: entry.canonicalObjectId,
                name: entry.name,
                kind: entry.kind,
                renderObjectIds: entry.renderObjectIds,
                attrs: entry.attrs,
                score,
            });
        }
        ranked.sort((a, b) => b.score - a.score || String(a.name).localeCompare(String(b.name)));
        return ranked.slice(0, 200);
    }

    dispose() {
        this._searchableEntries = [];
        this.indexReady = false;
        this._buildPromise = null;
        this.rvmIndex = null;
        this.identityMap = null;
    }
}
