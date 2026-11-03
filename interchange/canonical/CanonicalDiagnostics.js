export class CanonicalDiagnostics {
  constructor() {
    this.messages = [];
  }

  add(level, code, message, details = {}) {
    this.messages.push({ level, code, message, details, ts: Date.now() });
  }

  info(code, message, details = {}) { this.add('INFO', code, message, details); }
  warn(code, message, details = {}) { this.add('WARN', code, message, details); }
  error(code, message, details = {}) { this.add('ERROR', code, message, details); }
}
