import { buildExportResult } from '../common/export-result.js';

export class GlbExportAdapter {
  export(project) {
    const jsonLikeScene = {
      projectId: project.id,
      assemblies: project.assemblies?.length || 0,
      segments: (project.segments || []).length,
      supports: (project.supports || []).length,
      annotations: (project.annotations || []).length,
    };

    // Simulate GLB generation by exporting metadata as JSON for now
    const text = JSON.stringify(jsonLikeScene);

    const losses = [{
      code: 'GLB_METADATA_LOSS',
      severity: 'info',
      sourceObjectId: project.id,
      sourceKind: 'project',
      targetFormat: 'GLB',
      preserved: ['geometry', 'materials'],
      dropped: ['rawAttributes', 'analyticalNodes']
    }];

    return buildExportResult({
      text,
      losses,
      meta: {
        producer: 'GlbExportAdapter',
        sourceFormat: project.metadata?.format || 'UNKNOWN',
        targetFormat: 'GLB'
      }
    });
  }
}
