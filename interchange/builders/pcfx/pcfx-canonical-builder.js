import { CanonicalProject } from '../../canonical/CanonicalProject.js';

export function buildPcfxCanonicalProject({ sourceRecord, parsed }) {
  const project = new CanonicalProject({
    id: `project-${sourceRecord.id}`,
    name: sourceRecord.name || 'PCFX Project',
    metadata: { format: 'PCFX', dialect: sourceRecord.dialect },
  });
  project.addSourceFile(sourceRecord);
  project.diagnostics.warn('PCFX_BUILDER_STUB', 'PCFX canonical builder starter implementation loaded. Map PCFX canonical items here.', {
    parsedKeys: Object.keys(parsed || {}),
  });
  return project;
}
