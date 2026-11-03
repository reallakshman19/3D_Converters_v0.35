import { buildSupportRenderItems } from './SupportRenderAdapter.js';
import { buildAnnotationRenderItems } from './AnnotationRenderAdapter.js';

export function buildRenderedPreview(project, viewState = {}) {
  return {
    assemblies: project.assemblies || [],
    nodes: project.nodes || [],
    segments: project.segments || [],
    components: project.components || [],
    supportRenderItems: buildSupportRenderItems(project, viewState.supportRenderMode || 'SYMBOL'),
    annotationRenderItems: buildAnnotationRenderItems(project, !!viewState.verificationMode),
    theme: viewState.theme || 'NavisDark',
  };
}
