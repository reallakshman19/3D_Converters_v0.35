/**
 * Reusable field mapping component to map source data columns (headers) to target fields.
 */
export class FieldMappingTable {
  /**
   * @param {Object} options
   * @param {Array<{key: string, label: string, required?: boolean}>} options.fields - Target fields to map to
   * @param {Array<string>} options.headers - Headers from the imported data source
   * @param {Object} options.fieldMap - Current mapping state { targetFieldKey: sourceHeaderName }
   * @param {Object} [options.columnPreviewMap] - Optional map showing previews of data under each header { headerName: "Sample (Value)" }
   * @param {function(string, string)} [options.onChange] - Callback when a mapping selector changes (fieldKey, selectedHeader)
   */
  constructor({ fields, headers, fieldMap = {}, columnPreviewMap = {}, onChange = () => {} }) {
    this.fields = fields;
    this.headers = headers;
    this.fieldMap = { ...fieldMap };
    this.columnPreviewMap = columnPreviewMap;
    this.onChange = onChange;
  }

  /**
   * Render HTML string for the field mapping grid.
   */
  renderHTML() {
    return `
      <div class="model-converters-workflow-map-grid">
        ${this.fields.map(field => {
          const selected = this.fieldMap[field.key] || '';
          const required = !!field.required;
          const label = field.label || field.key;
          return `
            <label class="model-converters-workflow-map-field">
              <span>${this._escape(label)}${required ? ' *' : ''}</span>
              <select data-field-map="${this._escapeAttr(field.key)}">
                <option value="">${required ? '-- required --' : '-- not mapped --'}</option>
                ${this.headers.map(header => {
                  const preview = this.columnPreviewMap[header] ? `${header} (${this.columnPreviewMap[header]})` : header;
                  return `
                    <option value="${this._escapeAttr(header)}" ${selected === header ? 'selected' : ''}>
                      ${this._escape(preview)}
                    </option>
                  `;
                }).join('')}
              </select>
            </label>
          `;
        }).join('')}
      </div>
    `;
  }

  /**
   * Bind event listeners to DOM.
   * @param {HTMLElement} rootEl 
   */
  bind(rootEl) {
    rootEl.querySelectorAll('[data-field-map]').forEach(select => {
      select.addEventListener('change', () => {
        const key = select.dataset.fieldMap;
        const value = select.value;
        this.fieldMap[key] = value;
        this.onChange(key, value);
      });
    });
  }

  /**
   * Returns current mapping state.
   */
  getMapping() {
    return { ...this.fieldMap };
  }

  _escape(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  _escapeAttr(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
