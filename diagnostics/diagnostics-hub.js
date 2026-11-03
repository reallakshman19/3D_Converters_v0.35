import { addLog, addTraceEvent } from '../core/logger.js';
import { emit } from '../core/event-bus.js';
import { RuntimeEvents } from '../contracts/runtime-events.js';

export function publishDiagnostic(entry) {
  if (entry.kind === 'trace') {
    addTraceEvent(entry);
  } else {
    const logEntry = { ...entry, message: entry.code ? `[${entry.code}] ${entry.message}` : entry.message };
    addLog(logEntry);
  }
  emit(RuntimeEvents.DIAGNOSTIC_EVENT, entry);
}

export const DiagnosticsHub = {
  snapshots: [],
  captureSnapshot: function(name, data) {
    this.snapshots.push({
      timestamp: Date.now(),
      name,
      data
    });
  }
};
