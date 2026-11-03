export class AccdbSupportBuilder {
    constructor() {}

    /**
     * Re-use support geometry/mapping logic conceptually, but read from ACCDB restraints table.
     * @param {Object} accdbTables - Tables containing 'Restraints' array
     * @param {Object} canonicalCoreBuilder - Builder to register Canonical objects
     */
    build(accdbTables, canonicalCoreBuilder) {
        if (!accdbTables || !accdbTables.Restraints) return;

        const { Restraints } = accdbTables;

        for (const restraint of Restraints) {
            // Read from Rest_ptr and node indices
            // Map to standard support fields
            // canonicalCoreBuilder.addSupport(...)
        }
    }
}
