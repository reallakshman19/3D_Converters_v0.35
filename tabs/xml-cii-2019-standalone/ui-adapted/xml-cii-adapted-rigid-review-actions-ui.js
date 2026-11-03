import {
  planNearestRigidWeightSuggestions,
  planRigidDtxrRatingOverrides,
} from '../xml-cii-rigid-review-actions.js';
import { openRigidSmartFillPolicyModal } from './xml-cii-adapted-rigid-policy-modal.js';

const INSTALL_FLAG = '__xmlCiiRigidReviewActionsV2';
let observer = null;

function text(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function numeric(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function dialogRows(dialog) {
  return [...dialog.querySelectorAll('tbody tr')]
    .filter((tr) => !tr.dataset.rigidSmartGroup)
    .map((tr) => {
      const cells = [...tr.children];
      const weightInput = tr.querySelector('.mc-rigid-review-input');
      const ratingInput = tr.querySelector('.mc-rigid-review-rating-input');
      if (!weightInput || !ratingInput) return null;
      return {
        key: weightInput.getAttribute('data-rigid-review-key')
          || ratingInput.getAttribute('data-rigid-review-key') || '',
        currentWeight: weightInput.value,
        weightInput,
        ratingInput,
        dtxr: text(cells[4]?.textContent),
        dtxrTitle: text(cells[4]?.getAttribute?.('title')),
        candidates: [...tr.querySelectorAll('[data-rigid-review-candidate]')]
          .map((button) => ({
            suggestedWeight: numeric(button.getAttribute('data-rigid-review-weight')),
            weight: numeric(button.getAttribute('data-rigid-review-weight')),
          })),
      };
    })
    .filter(Boolean);
}

function setStatus(dialog, message, bad = false) {
  const status = dialog.querySelector('[data-rigid-smart-status], [data-rigid-review-status]');
  if (!status) return;
  status.textContent = message;
  status.style.color = bad ? '#fecaca' : '#bbf7d0';
  status.style.background = bad ? 'rgba(127,29,29,.24)' : 'rgba(20,83,45,.22)';
  status.style.border = `1px solid ${bad ? 'rgba(248,113,113,.34)' : 'rgba(74,222,128,.28)'}`;
  status.style.padding = '7px 9px';
  status.style.borderRadius = '6px';
}

function actionButton(label, attribute) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.setAttribute(attribute, 'true');
  Object.assign(button.style, {
    cursor: 'pointer',
    background: '#1d4ed8',
    border: '1px solid #60a5fa',
    color: '#ffffff',
    borderRadius: '6px',
    padding: '8px 14px',
    fontSize: '12px',
    fontWeight: '700',
    whiteSpace: 'nowrap',
  });
  return button;
}

function applyNearestSuggestions(dialog) {
  const rows = dialogRows(dialog);
  const plan = planNearestRigidWeightSuggestions(rows);
  const values = dialog._rigidSmartValues ||= {};
  for (const row of rows) {
    const update = plan.updates[row.key];
    if (!(Number.isFinite(update) && update > 0)) continue;
    row.weightInput.value = String(update);
    values[row.key] = { value: String(update), source: 'nearest' };
  }
  const detail = [
    `${plan.appliedCount} blank/zero weight${plan.appliedCount === 1 ? '' : 's'} populated`,
    plan.preservedCount
      ? `${plan.preservedCount} existing value${plan.preservedCount === 1 ? '' : 's'} preserved`
      : '',
    plan.missingCount
      ? `${plan.missingCount} row${plan.missingCount === 1 ? '' : 's'} had no suggestion`
      : '',
  ].filter(Boolean).join(' · ');
  setStatus(dialog, detail || 'No blank row has a nearest suggestion.', plan.appliedCount === 0);
}

function applyDtxrRatings(dialog) {
  const rows = dialogRows(dialog);
  const plan = planRigidDtxrRatingOverrides(rows);
  for (const row of rows) {
    const update = plan.updates[row.key];
    row.ratingInput.value = update || '';
  }
  if (!plan.appliedCount) {
    setStatus(
      dialog,
      plan.conflictCount
        ? `DTXR Rating apply blocked: ${plan.conflictCount} row(s) contain conflicting DTXR ratings.`
        : 'No unambiguous DTXR Rating was found in the listed rows.',
      true,
    );
    return;
  }
  const detail = [
    `${plan.appliedCount} DTXR Rating override${plan.appliedCount === 1 ? '' : 's'} prepared`,
    plan.conflictCount
      ? `${plan.conflictCount} conflict${plan.conflictCount === 1 ? '' : 's'} skipped`
      : '',
    plan.missingCount
      ? `${plan.missingCount} row${plan.missingCount === 1 ? '' : 's'} without DTXR Rating`
      : '',
  ].filter(Boolean).join(' · ');
  setStatus(dialog, `${detail}. Refreshing nearest weight suggestions.`, false);
  dialog.querySelector('[data-rigid-review-refresh]')?.click();
}

function ensureActions(dialog) {
  const applyButton = dialog.querySelector('[data-rigid-review-apply]');
  const actionGroup = applyButton?.parentElement;
  if (!actionGroup) return;
  actionGroup.style.flexWrap = 'wrap';
  actionGroup.style.justifyContent = 'flex-end';
  if (!actionGroup.querySelector('[data-rigid-apply-dtxr-rating]')) {
    const button = actionButton('Apply Rating as per DTXR', 'data-rigid-apply-dtxr-rating');
    button.addEventListener('click', () => applyDtxrRatings(dialog));
    actionGroup.insertBefore(button, actionGroup.firstChild);
  }
  if (!actionGroup.querySelector('[data-rigid-apply-nearest]')) {
    const button = actionButton('Apply nearest suggestions', 'data-rigid-apply-nearest');
    button.addEventListener('click', () => applyNearestSuggestions(dialog));
    const skip = actionGroup.querySelector('[data-rigid-review-skip]');
    actionGroup.insertBefore(button, skip || applyButton);
  }
}

function interceptPolicyClick(event) {
  const button = event.target?.closest?.(
    'button[title="Smart-fill policy"], button[aria-label="Smart-fill policy"]',
  );
  if (!button) return;
  const dialog = button.closest('.mc-rigid-review-dialog');
  if (!dialog) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  openRigidSmartFillPolicyModal({ dialog, opener: button });
}

function scan() {
  document.querySelectorAll('.mc-rigid-review-dialog').forEach(ensureActions);
}

export function installRigidReviewActionsEnhancement() {
  if (typeof document === 'undefined' || globalThis[INSTALL_FLAG]) return;
  globalThis[INSTALL_FLAG] = true;
  document.addEventListener('click', interceptPolicyClick, true);
  observer = new MutationObserver(scan);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  scan();
}
