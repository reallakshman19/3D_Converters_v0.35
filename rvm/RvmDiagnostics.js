import { notify } from '../diagnostics/notification-center.js';
import { emit } from '../core/event-bus.js';
import { RuntimeEvents } from '../contracts/runtime-events.js';
import { state } from '../core/state.js';

export class RvmDiagnostics {
  /**
   * Clears the diagnostics array and notifies the UI.
   */
  static clear() {
    if (!state.rvm) return;
    state.rvm.diagnostics = [];
    emit(RuntimeEvents.RVM_CONFIG_CHANGED, { reason: 'diagnostics-cleared' });
  }

  /**
   * Reports an issue (error, warning, info) and optionally surfaces it via notify().
   */
  static report(level, message, details = null) {
    if (!state.rvm) return;

    const entry = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      level,
      message,
      details
    };

    state.rvm.diagnostics.push(entry);

    // Always notify for errors and warnings
    if (level === 'error' || level === 'warning') {
      notify({
        level,
        title: `RVM ${level === 'error' ? 'Error' : 'Warning'}`,
        message,
        details
      });
    } else {
       // Info might just be logged quietly, but we can also notify
       notify({
         level: 'info',
         title: 'RVM Info',
         message,
         details
       });
    }

    emit(RuntimeEvents.RVM_CONFIG_CHANGED, { reason: 'diagnostic-added' });
  }
}
