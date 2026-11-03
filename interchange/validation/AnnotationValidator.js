export function validateAnnotations(project) {
  const issues = [];
  for (const ann of project.annotations || []) {
    if (!ann.text) issues.push({ level: 'WARN', code: 'ANNOTATION_EMPTY_TEXT', message: `Annotation ${ann.id} has empty text.` });
    if (!ann.anchorRef) issues.push({ level: 'WARN', code: 'ANNOTATION_NO_ANCHOR', message: `Annotation ${ann.id} has no anchor.` });
  }
  return issues;
}
