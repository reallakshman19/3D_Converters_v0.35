import { logs, traceEvents } from '../core/logger.js';
import { notifications } from './notification-center.js';
import { state } from '../core/state.js';

export function exportDiagnosticsBundle() {
  return {
    exportedAt: new Date().toISOString(),
    logs,
    traceEvents,
    supportDebug: state.sticky?.supportMappings || [],
    perf: state.editorState?.diagnostics?.metrics || {},
    notifications,
  };
}
