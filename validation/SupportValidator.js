export function validateSupports(project) {
  const issues = [];
  for (const support of project.supports || []) {
    if (!support.hostRef) issues.push({ level: 'WARN', code: 'SUPPORT_NO_HOST', message: `Support ${support.id} has no hostRef.` });
    if (!support.normalized?.supportDirection) issues.push({ level: 'WARN', code: 'SUPPORT_NO_DIRECTION', message: `Support ${support.id} has no direction.` });
  }
  return issues;
}
