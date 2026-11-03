export function buildSupportRenderItems(project, mode = 'SYMBOL') {
  return (project.supports || []).map((support) => ({
    id: support.id,
    renderClass: mode,
    hostRef: support.hostRef,
    supportKind: support.normalized?.supportKind || 'REST',
    supportDirection: support.normalized?.supportDirection || '',
  }));
}
