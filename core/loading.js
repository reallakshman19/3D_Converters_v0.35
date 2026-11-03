/**
 * loading.js — controls the global #app-loading-overlay element.
 * showLoading(label?) / hideLoading() can be called from anywhere.
 */

export function showLoading(label = 'Loading…') {
  const el = document.getElementById('app-loading-overlay');
  const lbl = document.getElementById('app-loading-label');
  if (lbl) lbl.textContent = label;
  el?.classList.add('is-visible');
}

export function hideLoading() {
  document.getElementById('app-loading-overlay')?.classList.remove('is-visible');
}
