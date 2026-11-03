import { CanonicalAnnotation } from '../../canonical/CanonicalAnnotation.js';
import { FidelityClass } from '../../canonical/FidelityClass.js';

export function buildXmlAnnotations({ assemblyId, nodes = [], segments = [], modelName = 'XML' }) {
  const nodeLabels = nodes.map((n) => new CanonicalAnnotation({
    id: `ANN-NODE-${n.id}`,
    assemblyId,
    annotationType: 'MESSAGE_CIRCLE',
    anchorType: 'NODE',
    anchorRef: n.id,
    anchorConfidence: 1,
    text: String(n.metadata?.displayNodeNo || n.id),
    sourceRefs: [{ format: 'XML', sourceId: `NODE:${n.id}` }],
    fidelity: FidelityClass.RECONSTRUCTED,
  }));

  const lineLabel = new CanonicalAnnotation({
    id: `ANN-LINE-${assemblyId}`,
    assemblyId,
    annotationType: 'MESSAGE_SQUARE',
    anchorType: 'ASSEMBLY',
    anchorRef: assemblyId,
    anchorConfidence: 1,
    text: `ASSEMBLY (${modelName})`,
    sourceRefs: [{ format: 'XML', sourceId: `ASSEMBLY:${assemblyId}` }],
    fidelity: FidelityClass.RECONSTRUCTED,
  });

  const lengthLabels = segments.map((s) => new CanonicalAnnotation({
    id: `ANN-LEN-${s.id}`,
    assemblyId,
    annotationType: 'LENGTH',
    anchorType: 'SEGMENT',
    anchorRef: s.id,
    anchorConfidence: 1,
    text: s.metadata?.lengthMm ? `${Math.round(s.metadata.lengthMm)} MM` : '',
    sourceRefs: s.sourceRefs,
    fidelity: FidelityClass.RECONSTRUCTED,
  }));

  return [...nodeLabels, lineLabel, ...lengthLabels.filter((a) => a.text)];
}
