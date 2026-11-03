import { PdfPointerReconstructor } from '../../builders/pdf/pdf-pointer-reconstructor.js';
import { AccdbGraphBuilder } from '../../builders/accdb/accdb-graph-builder.js';
import { AccdbSupportBuilder } from '../../builders/accdb/accdb-support-builder.js';

export class CaesarPdfImportAdapter {
    constructor() {
        this.pointerReconstructor = new PdfPointerReconstructor();
        this.graphBuilder = new AccdbGraphBuilder();
        this.supportBuilder = new AccdbSupportBuilder();
    }

    /**
     * Parses PDF text, reconstructs pointers, and builds Canonical entities.
     * @param {string} pdfText
     * @param {Object} canonicalCoreBuilder
     */
    async importFile(pdfText, canonicalCoreBuilder) {
        // 1. Reconstruct pointers from PDF text to get ACCDB-equivalent tables
        const accdbTables = this.pointerReconstructor.reconstruct(pdfText);

        // 2. Feed tables to graph builder
        this.graphBuilder.build(accdbTables, canonicalCoreBuilder);

        // 3. Feed tables to support builder
        this.supportBuilder.build(accdbTables, canonicalCoreBuilder);
    }
}
