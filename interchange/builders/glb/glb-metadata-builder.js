import { CanonicalProject } from '../../canonical/CanonicalProject.js';
import { FidelityClass } from '../../canonical/FidelityClass.js';
import { classifyGlbImport } from './glb-scene-classifier.js';

export function buildGlbCanonicalProject({ sourceRecord, parsed }) {
  const classification = classifyGlbImport(parsed || {});
  const project = new CanonicalProject({
    id: `project-${sourceRecord.id}`,
    name: sourceRecord.name || 'GLB Project',
    metadata: { format: 'GLB', dialect: classification },
  });
  project.addSourceFile(sourceRecord);
  project.diagnostics.warn('GLB_IMPORT_CLASS', `GLB import classified as ${classification}.`, {
    fidelity: classification === 'METADATA_ASSISTED' ? FidelityClass.METADATA_ONLY : FidelityClass.VIEW_ONLY,
  });
  return project;
}
