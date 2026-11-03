export function buildCanonicalPreview(project) {
  return {
    projectId: project.id,
    projectName: project.name,
    assemblies: (project.assemblies || []).map((asm) => ({
      id: asm.id,
      name: asm.name,
      nodes: asm.nodeIds.length,
      segments: asm.segmentIds.length,
      supports: asm.supportIds.length,
      annotations: asm.annotationIds.length,
    })),
    counts: {
      nodes: (project.nodes || []).length,
      segments: (project.segments || []).length,
      components: (project.components || []).length,
      supports: (project.supports || []).length,
      annotations: (project.annotations || []).length,
    },
  };
}
