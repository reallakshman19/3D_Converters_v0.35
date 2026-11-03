import { detectXmlCiiWorkflowSourceKind, workflowOutputKindForSource } from './xml-cii-workflow-source-detect.js?v=20260804-mds-position-restraints-1';
import { normalizeWorkflowJob, normalizeWorkflowResult } from './xml-cii-workflow-types.js?v=20260804-mds-position-restraints-1';
import { runXmlCii2019WorkflowService } from './xml-cii-workflow-service.js?v=20260804-mds-position-restraints-1';
import { enrichStandaloneXmlForRun } from './xml-cii-standalone-run-parity-mds-restraints.js?v=20260804-mds-position-restraints-1';

export async function runXmlCii2019Workflow(job, runtime = {}) {
  const normalized = normalizeWorkflowJob(job);
  if (!normalized.ok) {
    const fallbackSourceKind = job?.sourceKind === 'inputxml' ? 'inputxml' : 'xml';
    return normalizeWorkflowResult({
      ok: false,
      sourceKind: fallbackSourceKind,
      outputKind: workflowOutputKindForSource(fallbackSourceKind),
      enrichedText: '',
      enrichedName: '',
      ciiText: null,
      ciiName: null,
      diagnostics: null,
      logs: [],
      error: normalized.error || 'Invalid XML to CII workflow job.',
    });
  }

  const workflowJob = normalized.job;
  const resolvedSourceKind = workflowJob.sourceKind === 'auto'
    ? detectXmlCiiWorkflowSourceKind(workflowJob.sourceText)
    : workflowJob.sourceKind;
  const serviceRuntime = resolvedSourceKind === 'xml'
    && typeof runtime.runParityEnricher !== 'function'
    ? { ...runtime, runParityEnricher: enrichStandaloneXmlForRun }
    : runtime;

  try {
    return await runXmlCii2019WorkflowService(
      { ...workflowJob, sourceKind: resolvedSourceKind },
      serviceRuntime,
    );
  } catch (error) {
    return normalizeWorkflowResult({
      ok: false,
      sourceKind: resolvedSourceKind,
      outputKind: workflowOutputKindForSource(resolvedSourceKind),
      enrichedText: '',
      enrichedName: '',
      ciiText: null,
      ciiName: null,
      diagnostics: null,
      logs: [],
      error: error?.message || String(error),
    });
  }
}

export { detectXmlCiiWorkflowSourceKind } from './xml-cii-workflow-source-detect.js?v=20260804-mds-position-restraints-1';
export {
  DEFAULT_XML_CII_WORKFLOW_OPTIONS,
  normalizeWorkflowJob,
  normalizeWorkflowOptions,
  validateSupportConfigJson,
} from './xml-cii-workflow-types.js?v=20260804-mds-position-restraints-1';
