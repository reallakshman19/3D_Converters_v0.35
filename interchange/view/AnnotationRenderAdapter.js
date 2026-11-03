export function buildAnnotationRenderItems(project, verificationMode = false) {
  return (project.annotations || []).map((ann) => ({
    id: ann.id,
    text: ann.text,
    anchorType: ann.anchorType,
    anchorRef: ann.anchorRef,
    forceVisible: verificationMode,
  }));
}
