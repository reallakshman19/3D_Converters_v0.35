export function validateCanonicalProject(project) {
  const issues = [];
  for (const asm of project.assemblies || []) {
    if (!asm.nodeIds.length) issues.push({ level: 'WARN', code: 'EMPTY_ASSEMBLY', message: `Assembly ${asm.id} has no nodes.` });
  }
  return issues;
}
