/**
 * Reusable modal component for conversion workflows.
 * Handles viewport confinement, sticky headers, backdrop clicks, close events, and body scroll locking.
 */
export class WorkflowModal {
  /**
   * @param {Object} options
   * @param {string} options.title - Modal title
   * @param {string} [options.subtitle] - Modal header subtitle
   * @param {Array<{id: string, label: string, state?: string}>} [options.tabs] - Optional array of tabs
   * @param {string} [options.activeTabId] - Currently active tab
   * @param {function(string)} [options.onTabChange] - Tab selection callback
   * @param {function()} [options.onClose] - Close callback
   */
  constructor({ title, subtitle = '', tabs = [], activeTabId = '', onTabChange = () => {}, onClose = () => {} }) {
    this.title = title;
    this.subtitle = subtitle;
    this.tabs = tabs;
    this.activeTabId = activeTabId;
    this.onTabChange = onTabChange;
    this.onClose = onClose;

    this.overlayEl = null;
    this.popupEl = null;
    this.bodyEl = null;
    this.fullscreen = false;
    this.workflowHealthObserver = null;
    this.workflowHealthScheduled = false;
  }

  /**
   * Opens the modal and locking body scroll.
   * @returns {HTMLElement} The body container element for custom rendering.
   */
  open() {
    if (this.overlayEl) return this.bodyEl;

    // Lock body scroll
    document.body.style.overflow = 'hidden';

    const overlay = document.createElement('div');
    overlay.className = 'model-converters-workflow-popup-overlay';

    overlay.innerHTML = `
      <div class="model-converters-workflow-popup" role="dialog" aria-modal="true" aria-label="${this.title}">
        <div class="model-converters-workflow-popup-head">
          <div>
            <div class="model-converters-workflow-popup-title">${this.title}</div>
            ${this.subtitle ? `<div class="model-converters-workflow-detail-text">${this.subtitle}</div>` : ''}
          </div>
          <div class="model-converters-workflow-popup-actions">
            <button type="button" class="model-converters-download-btn model-converters-workflow-popup-fullscreen" data-modal-fullscreen>Fullscreen</button>
            <button type="button" class="model-converters-download-btn model-converters-workflow-popup-close" data-modal-close>Close</button>
          </div>
        </div>
        ${this.tabs.length ? `
          <div class="model-converters-workflow-popup-tabs" data-modal-tabs>
            ${this.tabs.map(t => `
              <button type="button" class="model-converters-workflow-phase ${t.id === this.activeTabId ? 'is-active' : ''} ${t.disabled ? 'is-disabled' : ''}" data-modal-tab="${t.id}" data-xml-cii-phase="${t.id}" ${t.disabled ? 'disabled aria-disabled="true"' : ''} title="${t.disabledReason || ''}">
                <span>${t.label}</span>
                ${t.state ? `<small>${t.state}</small>` : ''}
              </button>
            `).join('')}
          </div>
        ` : ''}
        <div class="model-converters-workflow-popup-body" data-modal-body></div>
      </div>
    `;

    document.body.appendChild(overlay);
    this.overlayEl = overlay;
    this.popupEl = overlay.querySelector('.model-converters-workflow-popup');
    this.bodyEl = overlay.querySelector('[data-modal-body]');

    // Bind close listeners. Backdrop click intentionally does not close the modal:
    // users frequently interact with large XML/CII workflow popups and accidental
    // outside clicks must not discard the current review state.
    overlay.querySelector('[data-modal-close]')?.addEventListener('click', () => this.close());
    overlay.querySelector('[data-modal-fullscreen]')?.addEventListener('click', () => this.toggleFullscreen());

    // Bind workflow tab clicks through the stable tab host, not individual buttons.
    // XML->CII popup bodies are re-rendered often; delegated tab handling keeps
    // the phase tabs responsive even when buttons are recreated or stale cached
    // listeners were stripped from workflow launchers.
    const tabHost = overlay.querySelector('[data-modal-tabs]');
    if (tabHost) {
      tabHost.addEventListener('click', (event) => {
        const btn = event.target?.closest?.('[data-modal-tab]');
        if (!btn || !tabHost.contains(btn)) return;
        event.preventDefault();
        event.stopPropagation();
        if (btn.disabled || btn.getAttribute('aria-disabled') === 'true') return;
        const tabId = btn.dataset.modalTab;
        if (!tabId) return;
        this.setActiveTab(tabId);
        this.onTabChange(tabId);
      }, { capture: true });
    }

    this.installWorkflowHealthDetector();
    return this.bodyEl;
  }

  installWorkflowHealthDetector() {
    if (!this.bodyEl || typeof MutationObserver === 'undefined') return;

    const schedule = () => {
      if (this.workflowHealthScheduled) return;
      this.workflowHealthScheduled = true;
      const run = () => {
        this.workflowHealthScheduled = false;
        this.renderWorkflowHealthNotice();
      };
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
      else setTimeout(run, 0);
    };

    this.workflowHealthObserver = new MutationObserver(schedule);
    this.workflowHealthObserver.observe(this.bodyEl, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    setTimeout(() => this.renderWorkflowHealthNotice(), 0);
  }

  renderWorkflowHealthNotice() {
    if (!this.bodyEl) return;

    const existing = this.bodyEl.querySelector('[data-workflow-line-regex-warning]');
    const text = String(this.bodyEl.innerText || this.bodyEl.textContent || '');
    const normalized = text.replace(/\s+/g, ' ').trim();
    const looksLikeXmlCiiPreview = /Branch Name/i.test(normalized) &&
      /Line Key/i.test(normalized) &&
      /Piping Class/i.test(normalized);

    if (!looksLikeXmlCiiPreview) {
      existing?.remove();
      return;
    }

    const issues = [];
    if (/\breview\s+0\s*%\b/i.test(normalized)) issues.push('0% master/line-list confidence');
    if (/\b0\s*mm\b/i.test(normalized)) issues.push('0 mm size/line-key result');
    if (/Line Key\s+Size\s+Piping Class/i.test(normalized) && /—|--|No match/i.test(normalized)) {
      issues.push('missing key line properties');
    }

    if (!issues.length) {
      existing?.remove();
      return;
    }

    const message = `Line Regex check: some key line items look unresolved (${Array.from(new Set(issues)).join(', ')}). Check the Line Regex tab before running XML → CII(2019).`;

    if (existing) {
      existing.querySelector('[data-workflow-warning-text]').textContent = message;
      return;
    }

    const notice = document.createElement('div');
    notice.dataset.workflowLineRegexWarning = 'true';
    notice.setAttribute('role', 'status');
    notice.style.cssText = [
      'position:sticky',
      'top:0',
      'z-index:5',
      'margin:0 0 10px 0',
      'padding:9px 12px',
      'border:1px solid rgba(255,176,32,0.45)',
      'border-radius:8px',
      'background:rgba(255,176,32,0.12)',
      'color:#ffd18a',
      'font-size:12px',
      'line-height:1.35',
      'box-shadow:0 6px 14px rgba(0,0,0,0.18)',
    ].join(';');
    notice.innerHTML = `<strong>Info:</strong> <span data-workflow-warning-text></span>`;
    notice.querySelector('[data-workflow-warning-text]').textContent = message;
    this.bodyEl.prepend(notice);
  }

  /**
   * Sets the active tab visually.
   * @param {string} tabId
   */
  setActiveTab(tabId) {
    this.activeTabId = tabId;
    if (!this.overlayEl) return;
    this.overlayEl.querySelectorAll('[data-modal-tab]').forEach(btn => {
      if (btn.dataset.modalTab === tabId) {
        btn.classList.add('is-active');
      } else {
        btn.classList.remove('is-active');
      }
    });
  }

  toggleFullscreen() {
    if (!this.popupEl) return;
    this.fullscreen = !this.fullscreen;
    this.popupEl.classList.toggle('is-fullscreen', this.fullscreen);
    const button = this.overlayEl?.querySelector('[data-modal-fullscreen]');
    if (button) button.textContent = this.fullscreen ? 'Restore' : 'Fullscreen';
  }

  /**
   * Closes the modal and restores scroll.
   */
  close() {
    if (!this.overlayEl) return;

    this.workflowHealthObserver?.disconnect?.();
    this.workflowHealthObserver = null;
    this.workflowHealthScheduled = false;

    // Restore scroll
    document.body.style.overflow = '';

    this.overlayEl.remove();
    this.overlayEl = null;
    this.popupEl = null;
    this.bodyEl = null;
    this.fullscreen = false;

    if (typeof this.onClose === 'function') {
      this.onClose();
    }
  }
}
