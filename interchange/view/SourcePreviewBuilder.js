export function buildSourcePreview(sourceRecord) {
  return {
    id: sourceRecord.id,
    name: sourceRecord.name,
    format: sourceRecord.format,
    dialect: sourceRecord.dialect,
    messageCount: sourceRecord.messages.length,
    objectCount: sourceRecord.objects.length,
    messages: sourceRecord.messages,
  };
}
