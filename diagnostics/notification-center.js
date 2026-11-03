// viewer/diagnostics/notification-center.js
import { emit } from '../core/event-bus.js';
import { DiagnosticsHub, publishDiagnostic } from './diagnostics-hub.js';
import { RuntimeEvents } from '../contracts/runtime-events.js';

export const notifications = [];

export function notify(payload) {
  if (typeof payload === 'string') {
    payload = { level: 'error', title: 'Alert', message: payload };
  }
  const { level = 'info', title = '', message = '', details = null } = payload;

  // Use fallback if crypto.randomUUID is not available in non-secure contexts
  const generateUUID = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  };

  const item = {
    id: generateUUID(),
    ts: Date.now(),
    level,
    title,
    message,
    details,
  };
  notifications.push(item);

  publishDiagnostic({
    severity: level,
    category: 'ui',
    message: `${title}: ${message}`.trim(),
    code: 'UI_NOTIFICATION',
    payload: details,
  });
  DiagnosticsHub.captureSnapshot('UI_NOTIFICATION', {
    severity: level,
    category: 'ui',
    message: `${title}: ${message}`.trim(),
    code: 'UI_NOTIFICATION',
    payload: details,
  });

  emit(RuntimeEvents.NOTIFY, item);

  // Minimal console fallback to ensure devs see alerts during transition
  if (level === 'error') {
    console.error(`[NOTIFICATION Error] ${title}: ${message}`, details || '');
  } else if (level === 'warning') {
    console.warn(`[NOTIFICATION Warning] ${title}: ${message}`, details || '');
  } else {
    console.log(`[NOTIFICATION Info] ${title}: ${message}`, details || '');
  }

  return item;
}

export function clearNotifications() {
  notifications.length = 0;
  emit(RuntimeEvents.NOTIFY, { type: 'clear' });
}
