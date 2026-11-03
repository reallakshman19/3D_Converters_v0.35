/**
 * A reusable file intake card component.
 */
export class FileInputCard {
  /**
   * @param {Object} options
   * @param {string} options.id - The HTML input ID suffix/prefix
   * @param {string} options.label - Label to display
   * @param {string} options.accept - Accepted file extensions (e.g. '.xml')
   * @param {boolean} [options.required] - Whether input is required
   * @param {function(File|null)} [options.onChange] - Callback when file is selected
   */
  constructor({ id, label, accept, required = false, onChange = () => {} }) {
    this.id = id;
    this.label = label;
    this.accept = accept;
    this.required = required;
    this.onChange = onChange;
    this.file = null;
    
    this.containerEl = null;
    this.inputEl = null;
    this.nameEl = null;
  }

  /**
   * Render HTML string for the file card.
   */
  renderHTML() {
    const requiredAttr = this.required ? 'required' : '';
    return `
      <label class="model-converters-file" id="file-card-${this.id}-label">
        <span id="file-card-${this.id}-title">${this.label} (${this.accept})</span>
        <input type="file" id="file-card-${this.id}-input" accept="${this.accept}" ${requiredAttr}>
        <small id="file-card-${this.id}-name">No file selected.</small>
      </label>
    `;
  }

  /**
   * Bind event listeners to DOM after rendering.
   * @param {HTMLElement} rootEl 
   */
  bind(rootEl) {
    this.inputEl = rootEl.querySelector(`#file-card-${this.id}-input`);
    this.nameEl = rootEl.querySelector(`#file-card-${this.id}-name`);
    this.containerEl = rootEl.querySelector(`#file-card-${this.id}-label`);

    if (this.inputEl) {
      this.inputEl.addEventListener('change', () => {
        this.file = this.inputEl.files?.[0] || null;
        if (this.nameEl) {
          this.nameEl.textContent = this.file ? this.file.name : 'No file selected.';
        }
        this.onChange(this.file);
      });
    }
  }

  /**
   * Set file programmatically.
   */
  setFile(file) {
    this.file = file;
    if (this.nameEl) {
      this.nameEl.textContent = file ? file.name : 'No file selected.';
    }
  }

  /**
   * Clear selection.
   */
  clear() {
    this.file = null;
    if (this.inputEl) {
      this.inputEl.value = '';
    }
    if (this.nameEl) {
      this.nameEl.textContent = 'No file selected.';
    }
  }

  /**
   * Set visible/hidden.
   */
  setVisible(visible) {
    if (this.containerEl) {
      this.containerEl.style.display = visible ? '' : 'none';
    }
  }
}
