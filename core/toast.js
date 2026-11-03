/**
 * toast.js — lightweight in-app notification system.
 * Replaces alert() and console.error calls with styled toasts.
 * Call showToast(message, type) from anywhere; the container is
 * created lazily in <body> on first use.
 */

let _container = null;

function _getContainer() {
  if (_container && _container.isConnected) return _container;
  _container = document.getElementById('app-toast-container');
  if (!_container) {
    _container = document.createElement('div');
    _container.id = 'app-toast-container';
    document.body.appendChild(_container);
  }
  return _container;
}

/**
 * @param {string} message
 * @param {'info'|'success'|'warn'|'error'} [type='info']
 * @param {number} [duration=4000] ms before auto-dismiss (0 = sticky)
 */
export function showToast(message, type = 'info', duration = 4000) {
  const container = _getContainer();
  const toast = document.createElement('div');
  toast.className = `app-toast app-toast--${type}`;
  toast.setAttribute('role', 'alert');
  toast.setAttribute('aria-live', 'assertive');

  const icons = { info: 'ℹ', success: '✓', warn: '⚠', error: '✕' };
  toast.innerHTML = `
    <span class="app-toast__icon" aria-hidden="true">${icons[type] || icons.info}</span>
    <span class="app-toast__msg"></span>
    <button class="app-toast__close" aria-label="Dismiss notification" type="button">✕</button>
  `;
  // Set text via textContent to prevent XSS
  toast.querySelector('.app-toast__msg').textContent = String(message);

  const dismiss = () => {
    toast.classList.add('app-toast--out');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  };
  toast.querySelector('.app-toast__close').addEventListener('click', dismiss);
  if (duration > 0) setTimeout(dismiss, duration);

  container.appendChild(toast);
  // Trigger enter animation on next frame
  requestAnimationFrame(() => toast.classList.add('app-toast--in'));
  return dismiss;
}
