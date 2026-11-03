/**
 * Base adapter class for the Universal Pipeline.
 */
class BaseAdapter {
  constructor(config) {
    this.config = config;
  }

  /**
   * Parse the source file and return an array of standardized components.
   * @param {string} filePath Path to the source file
   * @returns {Array<Object>} List of components ready for merging
   */
  parse(filePath) {
    throw new Error("Adapter must implement parse()");
  }

  /**
   * Helper to apply field mappings from config
   * @param {Object} rawComponent The raw parsed object
   * @param {Object} fieldMap The field map from config
   * @returns {Object} Mapped object
   */
  mapFields(rawComponent, fieldMap) {
    const mapped = {};
    for (const [rawField, canonField] of Object.entries(fieldMap)) {
      if (rawComponent[rawField] !== undefined) {
        mapped[canonField] = rawComponent[rawField];
      }
    }
    // Keep unmapped fields as extra data
    for (const [k, v] of Object.entries(rawComponent)) {
      if (!fieldMap[k]) {
        mapped[k] = v;
      }
    }
    return mapped;
  }
}

module.exports = BaseAdapter;
