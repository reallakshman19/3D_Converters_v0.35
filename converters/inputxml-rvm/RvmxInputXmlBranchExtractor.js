import { createUxmlDocument } from './RvmxUxmlTypes.js';
import { mapInputXmlToUxml } from './RvmxUxmlInputXmlSchemaMapper.js';

function text(value) {
  return String(value ?? '').trim();
}

function componentBranchKey(component) {
  return text(component?.pipelineRef || component?.lineKey || component?.rawAttributes?.pipelineRef || 'UNASSIGNED');
}

function componentBranchAliases(component) {
  return [
    component?.pipelineRef,
    component?.lineKey,
    component?.rawAttributes?.pipelineRef,
  ].map(text).filter(Boolean);
}

export function extractInputXmlBranches(xmlText, options = {}) {
  if (!text(xmlText)) {
    return {
      ok: false,
      branches: [],
      doc: createUxmlDocument(),
      diagnostics: [{
        type: 'inputxml-glb-empty-input',
        severity: 'ERROR',
        message: 'Input XML text is empty.',
      }],
    };
  }

  const doc = createUxmlDocument({
    header: {
      createdBy: 'InputXML→GLB',
      createdAt: new Date(0).toISOString(),
      purpose: 'inputxml-to-glb',
      notes: '',
    },
  });

  const result = mapInputXmlToUxml(xmlText, doc, options.sourceId || 'inputxml-glb', {
    fileName: options.fileName || '',
    selectedSourceType: 'inputxml-to-glb',
  });

  const componentCounts = new Map();
  for (const component of doc.components || []) {
    const key = componentBranchKey(component);
    componentCounts.set(key, (componentCounts.get(key) || 0) + 1);
  }

  const branches = [];
  const seenAliases = new Set();

  for (const pipeline of doc.pipelines || []) {
    const aliases = [
      pipeline.id,
      pipeline.pipelineRef,
      pipeline.lineKey,
      pipeline.lineNo,
      pipeline.rawAttributes?.pipelineRef,
    ].map(text).filter(Boolean);

    const id = aliases[0] || 'UNASSIGNED';
    const componentCount = aliases.reduce((max, alias) => Math.max(max, componentCounts.get(alias) || 0), 0);

    aliases.forEach((alias) => seenAliases.add(alias));
    branches.push({
      id,
      label: text(pipeline.pipelineRef || pipeline.lineNo || pipeline.lineKey || id),
      pipelineRef: text(pipeline.pipelineRef),
      lineKey: text(pipeline.lineKey),
      lineNo: text(pipeline.lineNo),
      aliases,
      componentCount,
    });
  }

  for (const component of doc.components || []) {
    for (const alias of componentBranchAliases(component)) {
      if (seenAliases.has(alias)) continue;
      seenAliases.add(alias);
      branches.push({
        id: alias,
        label: alias,
        pipelineRef: alias,
        lineKey: '',
        lineNo: '',
        aliases: [alias],
        componentCount: componentCounts.get(alias) || 0,
      });
    }
  }

  const diagnostics = [...(doc.diagnostics || []), ...(doc.lossContract || [])];

  return {
    ok: result?.ok === true,
    branches,
    doc,
    diagnostics,
  };
}
