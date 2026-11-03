export function classifyGlbImport(glbLike) {
  const extrasRichness = !!glbLike?.extras || !!glbLike?.metadata || !!glbLike?.userData;
  const nodeCount = Number(glbLike?.nodeCount || glbLike?.nodes?.length || 0);
  const meshCount = Number(glbLike?.meshCount || glbLike?.meshes?.length || 0);
  if (extrasRichness && (nodeCount > 0 || meshCount > 0)) return 'METADATA_ASSISTED';
  if (meshCount > 0 || nodeCount > 0) return 'SCENE_ONLY';
  return 'UNKNOWN';
}
