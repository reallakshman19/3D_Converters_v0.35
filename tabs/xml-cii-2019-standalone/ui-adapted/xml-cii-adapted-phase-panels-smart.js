import { renderActivePhase as renderBaseActivePhase } from './xml-cii-adapted-phase-panels.js?v=20260804-support-family-strict-line-v2';
import { enhanceRegexSmartWorkbench } from './xml-cii-adapted-regex-smart-ui.js';

const STRICT_NOTICE_ATTR = 'data-strict-line-authority-notice';

function applyStrictLineAuthorityUi(card) {
  const button = card?.querySelector?.('.bulk-autosuggest-btn');
  button?.remove?.();
  const wrapper = card?.querySelector?.('.bulk-branch-mapping-wrapper');
  if (!wrapper || wrapper.querySelector(`[${STRICT_NOTICE_ATTR}]`)) return;
  wrapper.insertAdjacentHTML(
    'afterbegin',
    `<div ${STRICT_NOTICE_ATTR}="true" class="model-converters-workflow-detail-note" style="margin:0 0 8px;border-color:#2563eb;color:#1e3a8a;background:#eff6ff;">Automatic similar line-number matching is disabled. Preview accepts only an explicit branch mapping or an exact loaded Line List key. Unresolved branches remain unmapped for Bulk Override.</div>`,
  );
}

function installStrictLineAuthorityUi(card) {
  if (!card) return;
  applyStrictLineAuthorityUi(card);
  if (typeof MutationObserver === 'undefined') return;
  card.__xmlCiiStrictLineObserver?.disconnect?.();
  const observer = new MutationObserver(() => applyStrictLineAuthorityUi(card));
  observer.observe(card, { childList: true, subtree: true });
  card.__xmlCiiStrictLineObserver = observer;
}

// The branch-scoped state ref used by processing phases returns a fresh
// processing-state object from its getter. Legacy Regex UI code frequently
// performs direct writes such as `stateRef.current.format1SelectedSample = x`.
// Without a write-through adapter those writes land on the temporary object
// and disappear immediately, leaving selectedSample empty and therefore
// rendering zero token cards. This adapter preserves the existing Regex UI
// contract while committing every top-level property write through the real
// state-ref setter.
function createRegexWriteThroughRef(stateRef) {
  if (!stateRef) return stateRef;
  return {
    modeABaseRef: stateRef.modeABaseRef,
    get current() {
      const snapshot = stateRef.current;
      if (!snapshot || typeof snapshot !== 'object' || typeof Proxy === 'undefined') return snapshot;
      return new Proxy(snapshot, {
        set(target, property, value) {
          target[property] = value;
          const latest = stateRef.current || {};
          stateRef.current = { ...latest, [property]: value };
          return true;
        },
      });
    },
    set current(next) {
      stateRef.current = next;
    },
  };
}

export function renderActivePhase(root, stateRef, render) {
  const phaseIdBeforeRender = stateRef?.current?.activePhaseId;
  const effectiveRef = phaseIdBeforeRender === 'regex' ? createRegexWriteThroughRef(stateRef) : stateRef;
  renderBaseActivePhase(root, effectiveRef, render);
  const phaseId = effectiveRef?.current?.activePhaseId;
  const card = root.querySelector(`[data-active-phase="${phaseId}"]`) || root;
  if (phaseId === 'regex') enhanceRegexSmartWorkbench(card, effectiveRef.current, effectiveRef, render);
  if (phaseId === 'preview') installStrictLineAuthorityUi(card);
}
