import { AccdbGraphBuilder } from '../../builders/accdb/accdb-graph-builder.js';
import { AccdbSupportBuilder } from '../../builders/accdb/accdb-support-builder.js';

export class CaesarAccdbImportAdapter {
    constructor() {
        this.graphBuilder = new AccdbGraphBuilder();
        this.supportBuilder = new AccdbSupportBuilder();
    }

    /**
     * Parses MDB/ACCDB tables and generates Canonical entities.
     * @param {File|ArrayBuffer} fileData
     * @param {Object} canonicalCoreBuilder
     */
    async importFile(fileData, canonicalCoreBuilder) {
        // 1. Parse MDB/ACCDB tables (mocked via generic accdb reader here)
        const accdbTables = await this._parseMdb(fileData);

        // 2. Feed tables to graph-builder
        this.graphBuilder.build(accdbTables, canonicalCoreBuilder);

        // 3. Feed tables to support-builder
        this.supportBuilder.build(accdbTables, canonicalCoreBuilder);
    }

    async _parseMdb(fileData) {
        // TODO: Replace with actual mdb-reader implementation
        return {
            Elements: [],
            Restraints: [],
            Bends: []
        };
    }
}
