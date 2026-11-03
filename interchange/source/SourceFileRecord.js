export class SourceFileRecord {
  constructor({ id, name, format, dialect = 'UNKNOWN', rawText = '', rawJson = null, rawBinary = null, metadata = {} } = {}) {
    this.id = id || `source-${Date.now()}`;
    this.name = name || this.id;
    this.format = format || 'UNKNOWN';
    this.dialect = dialect;
    this.rawText = rawText;
    this.rawJson = rawJson;
    this.rawBinary = rawBinary;
    this.metadata = metadata;
    this.objects = [];
    this.messages = [];
  }

  addMessage(level, message, details = {}) {
    this.messages.push({ level, message, details, ts: Date.now() });
  }

  addObject(record) {
    this.objects.push(record);
    return record;
  }
}
