import { extractXmlCiiRatingFromDtxr } from '../../../converters/xml-cii2019-core/dtxr-rating-resolver.js';

function text(value) { return value === undefined || value === null ? '' : String(value).trim(); }
function styleButton(button) {
  Object.assign(button.style, {
    cursor: 'pointer',
    background: '#1e293b',
    border: '1px solid #334155',
    color: '#cbd5e1',
    borderRadius: '6px',
    padding: '7px 12px',
    fontSize: '11px',
    whiteSpace: 'nowrap',
  });
}

function isConsolidated(dialog) {
  return /Rigid Weights Need Review\s*—\s*Consolidated/i.test(text(dialog?.textContent));
}

function enhance(dialog) {
  if (!dialog || !isConsolidated(dialog) || dialog.dataset.modeARigidExtraTools === 'true') return false;
  dialog.dataset.modeARigidExtraTools = 'true';
  const refresh = dialog.querySelector('[data-mode-a-rigid-refresh]');
  const exact = dialog.querySelector('[data-mode-a-rigid-fill-exact]');
  const controls = refresh?.parentElement || exact?.parentElement;
  if (!controls) return false;

  const dtxr = document.createElement('button');
  dtxr.type = 'button';
  dtxr.dataset.modeARigidUseDtxr = 'true';
  dtxr.textContent = 'Use DTXR Ratings & Refresh';
  dtxr.title = 'Fill available Rating inputs from each row DTXR evidence and refresh weight suggestions. Values are not committed until Apply Weights and Run All Models.';
  styleButton(dtxr);

  const all = document.createElement('button');
  all.type = 'button';
  all.dataset.modeARigidFillAllSuggestions = 'true';
  all.textContent = 'Use All Suggestions';
  all.title = 'Fill each visible review row with its first available suggestion. This is a review aid only; no weight is committed until Apply Weights and Run All Models.';
  styleButton(all);

  const status = dialog.querySelector('[data-mode-a-rigid-status]');
  const setStatus = (message, bad = false) => {
    if (!status) return;
    status.textContent = message;
    status.style.color = bad ? '#ef4444' : '#10b981';
  };

  dtxr.addEventListener('click', () => {
    let count = 0;
    for (const row of dialog.querySelectorAll('[data-mode-a-rigid-review-row]')) {
      const input = row.querySelector('.mc-rigid-review-rating-input');
      const dtxrText = text(row.children?.[5]?.textContent);
      const rating = extractXmlCiiRatingFromDtxr(dtxrText);
      if (!input || !rating) continue;
      input.value = rating;
      input.style.borderColor = '#10b981';
      count += 1;
    }
    if (!count) {
      setStatus('No DTXR Rating evidence was found in the listed review rows.', true);
      return;
    }
    setStatus(`Filled ${count} DTXR Rating value(s); refreshing suggestions…`, false);
    refresh?.click();
  });

  all.addEventListener('click', () => {
    let count = 0;
    for (const row of dialog.querySelectorAll('[data-mode-a-rigid-review-row]')) {
      if (row.style.display === 'none') continue;
      const input = row.querySelector('.mc-rigid-review-input');
      const candidate = row.querySelector('[data-mode-a-rigid-candidate]');
      const weight = Number(candidate?.dataset?.modeARigidWeight);
      if (!input || !Number.isFinite(weight) || weight <= 0) continue;
      input.value = String(weight);
      count += 1;
    }
    setStatus(count
      ? `Filled ${count} first suggestion(s). Review all values before applying.`
      : 'No visible positive suggestions are available.',
      count === 0);
  });

  if (exact) exact.insertAdjacentElement('beforebegin', dtxr);
  else controls.appendChild(dtxr);
  dtxr.insertAdjacentElement('afterend', all);
  return true;
}

export function installModeAConsolidatedRigidReviewTools() {
  if (typeof document === 'undefined') return false;
  const scan = () => {
    for (const dialog of document.querySelectorAll('.mc-rigid-review-dialog')) enhance(dialog);
  };
  scan();
  if (document.documentElement?.dataset?.modeARigidReviewObserver === 'true') return true;
  document.documentElement.dataset.modeARigidReviewObserver = 'true';
  if (typeof MutationObserver === 'undefined' || !document.body) return true;
  const observer = new MutationObserver(scan);
  observer.observe(document.body, { childList: true, subtree: true });
  document.documentElement.__modeARigidReviewObserver = observer;
  return true;
}
