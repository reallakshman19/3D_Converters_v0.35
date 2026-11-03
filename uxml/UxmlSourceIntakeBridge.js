/**
 * UxmlSourceIntakeBridge.js
 *
 * Source intake bridge for Universal XML.
 *
 * PCF:
 *   PCF -> Standard XML -> UXML
 *
 * PDF:
 *   PDF -> existing pdf_to_inputxml converterExecutor -> InputXML -> UXML
 *
 * Boundary:
 * - Does not generate PCF.
 * - Does not resolve masters.
 * - Does not run topology.
 */

import { XML_PROFILES } from './UxmlConstants.js';
import { normalizeXmlToUxml } from './UxmlNormalizer.js';
import { convertPcfTextToStandardXml } from './UxmlPcfStandardXmlBridge.js';

export const UXML_SOURCE_INTAKE_BRIDGE_SCHEMA =
  'uxml-source-intake-bridge/v1';

export const UXML_SOURCE_TYPES = Object.freeze({
  AUTO: 'AUTO',
  PCF: 'PCF',
  PDF: 'PDF',
  STAGED_JSON: 'STAGED_JSON',
  INPUT_XML: 'INPUT_XML',
  STANDARD_XML: 'STANDARD_XML',
  EXISTING_XML: 'EXISTING_XML',
  UXML: 'UXML',
});

export const UXML_SOURCE_INTAKE_ROUTES = Object.freeze({
  PCF: {
    sourceType: UXML_SOURCE_TYPES.PCF,
    strategy: 'INTERNAL_STANDARD_XML_BRIDGE',
    bridgeConverterId: 'pcf_to_standardxml',
    bridgeOutputProfile: XML_PROFILES.STANDARD_XML || 'STANDARD_XML',
  },

  PDF: {
    sourceType: UXML_SOURCE_TYPES.PDF,
    strategy: 'EXISTING_CONVERTER_BRIDGE',
    bridgeConverterId: 'pdf_to_inputxml',
    bridgeOutputProfile: XML_PROFILES.INPUT_XML || 'INPUT_XML',
  },

  STAGED_JSON: {
    sourceType: UXML_SOURCE_TYPES.STAGED_JSON,
    strategy: 'EXISTING_CONVERTER_BRIDGE',
    bridgeConverterId: 'stagedjson_to_inputxml',
    bridgeOutputProfile: XML_PROFILES.INPUT_XML || 'INPUT_XML',
  },

  INPUT_XML: {
    sourceType: UXML_SOURCE_TYPES.INPUT_XML,
    strategy: 'DIRECT_XML_NORMALIZATION',
    directProfile: XML_PROFILES.INPUT_XML || 'INPUT_XML',
  },

  STANDARD_XML: {
    sourceType: UXML_SOURCE_TYPES.STANDARD_XML,
    strategy: 'DIRECT_XML_NORMALIZATION',
    directProfile: XML_PROFILES.STANDARD_XML || 'STANDARD_XML',
  },

  EXISTING_XML: {
    sourceType: UXML_SOURCE_TYPES.EXISTING_XML,
    strategy: 'DIRECT_XML_NORMALIZATION',
    directProfile: XML_PROFILES.STANDARD_XML || 'STANDARD_XML',
  },

  UXML: {
    sourceType: UXML_SOURCE_TYPES.UXML,
    strategy: 'DIRECT_UXML_NORMALIZATION',
    directProfile: XML_PROFILES.UXML || 'UXML',
  },
});

function clean(value) {
  return String(value ?? '').trim();
}

function upper(value) {
  return clean(value).toUpperCase();
}

function ext(fileName) {
  const match = clean(fileName).match(/\.([A-Za-z0-9]+)$/);
  return match ? upper(match[1]) : '';
}

function normalizeSourceType(value) {
  const type = upper(value || UXML_SOURCE_TYPES.AUTO);

  if (type === 'PDF_TO_INPUTXML') return UXML_SOURCE_TYPES.PDF;
  if (type === 'JSON_TO_XML' || type === 'STAGEDJSON_TO_INPUTXML') return UXML_SOURCE_TYPES.STAGED_JSON;
  if (type === 'EXISTING_XML' || type === 'XML' || type === 'STANDARD') return UXML_SOURCE_TYPES.STANDARD_XML;

  return type || UXML_SOURCE_TYPES.AUTO;
}

export function detectUxmlSourceType({
  fileName = '',
  text = '',
  selectedSourceType = UXML_SOURCE_TYPES.AUTO,
} = {}) {
  const selected = normalizeSourceType(selectedSourceType);
  if (selected && selected !== UXML_SOURCE_TYPES.AUTO) return selected;

  const extension = ext(fileName);
  const head = String(text || '').slice(0, 4000);
  const upperHead = upper(head);
  const trimmed = String(text || '').trimStart();

  if (extension === 'PCF') return UXML_SOURCE_TYPES.PCF;
  if (extension === 'PDF') return UXML_SOURCE_TYPES.PDF;
  if (extension === 'JSON') return UXML_SOURCE_TYPES.STAGED_JSON;
  if (extension === 'XML') {
    if (
      upperHead.includes('CAESAR') ||
      upperHead.includes('PIPINGMODEL') ||
      upperHead.includes('PIPINGELEMENT') ||
      upper(fileName).includes('INPUT')
    ) {
      return UXML_SOURCE_TYPES.INPUT_XML;
    }

    if (upperHead.includes('<UXML')) return UXML_SOURCE_TYPES.UXML;
    return UXML_SOURCE_TYPES.STANDARD_XML;
  }

  if (upperHead.includes('ISOGEN-FILES') || upperHead.includes('PIPELINE-REFERENCE')) {
    return UXML_SOURCE_TYPES.PCF;
  }

  if (trimmed.startsWith('%PDF')) return UXML_SOURCE_TYPES.PDF;
  if (
    extension === 'JSON' ||
    trimmed.startsWith('{') ||
    trimmed.startsWith('[') ||
    upperHead.includes('"BRANCH"') ||
    upperHead.includes('"CHILDREN"')
  ) {
    return UXML_SOURCE_TYPES.STAGED_JSON;
  }
  if (upperHead.includes('<UXML')) return UXML_SOURCE_TYPES.UXML;

  return UXML_SOURCE_TYPES.STANDARD_XML;
}

export function resolveUxmlSourceIntakeRoute({
  fileName = '',
  text = '',
  selectedSourceType = UXML_SOURCE_TYPES.AUTO,
} = {}) {
  const sourceType = detectUxmlSourceType({
    fileName,
    text,
    selectedSourceType,
  });

  const normalizedType = normalizeSourceType(sourceType);
  const route = UXML_SOURCE_INTAKE_ROUTES[normalizedType];

  if (!route) {
    return {
      schema: UXML_SOURCE_INTAKE_BRIDGE_SCHEMA,
      ok: false,
      blocked: true,
      sourceType: normalizedType,
      reason: `No UXML source intake route is defined for ${normalizedType}.`,
    };
  }

  return {
    schema: UXML_SOURCE_INTAKE_BRIDGE_SCHEMA,
    ok: true,
    blocked: false,
    sourceType: normalizedType,
    ...route,
  };
}

function extractConverterOutputText(result) {
  if (!result) return '';

  if (Array.isArray(result.outputs)) {
    const firstTextOutput = result.outputs.find(entry => entry && typeof entry.text === 'string');
    if (firstTextOutput) return String(firstTextOutput.text);
  }

  return String(
    result.outputText ||
    result.text ||
    result.xmlText ||
    result.inputXmlText ||
    result.standardXml ||
    result.output ||
    ''
  );
}

function resolveBridgeInputFile(sourceFile, sourceBlob, sourceArrayBuffer, fileName) {
  if (sourceFile && sourceArrayBuffer instanceof ArrayBuffer) {
    return {
      role: 'primary',
      name: String(sourceFile.name || fileName || 'input.dat'),
      bytes: sourceArrayBuffer,
    };
  }

  if (sourceBlob && sourceArrayBuffer instanceof ArrayBuffer) {
    return {
      role: 'primary',
      name: String(fileName || sourceBlob.name || 'input.dat'),
      bytes: sourceArrayBuffer,
    };
  }

  return null;
}

async function invokeConverterBridge({
  converterExecutor,
  bridgeConverterId,
  sourceText,
  sourceFile,
  sourceBlob,
  sourceArrayBuffer,
  fileName,
  converterOptions,
}) {
  const primaryInputFile = resolveBridgeInputFile(sourceFile, sourceBlob, sourceArrayBuffer, fileName);
  const converterRequest = {
    converterId: bridgeConverterId,
    sourceText,
    sourceFile,
    sourceBlob,
    sourceArrayBuffer,
    fileName,
    options: converterOptions,
  };

  if (primaryInputFile) {
    converterRequest.inputFiles = [primaryInputFile];
  }

  return converterExecutor(converterRequest);
}

function bridgeBlocked({ route, code, message, details = {} }) {
  return {
    schema: UXML_SOURCE_INTAKE_BRIDGE_SCHEMA,
    ok: false,
    blocked: true,
    route,
    normalized: null,
    bridgeOutputText: '',
    diagnostics: [
      {
        severity: 'ERROR',
        code,
        message,
        details,
      },
    ],
    generatedPcf: false,
    pcfTextByPipelineRef: undefined,
    masterResolution: undefined,
    masterResolutionRequests: undefined,
  };
}

export async function runUxmlSourceIntakeBridge({
  text = '',
  fileName = '',
  selectedSourceType = UXML_SOURCE_TYPES.AUTO,
  sourceFile = null,
  sourceBlob = null,
  sourceArrayBuffer = null,
  converterExecutor = null,
  converterOptions = {},
} = {}) {
  const route = resolveUxmlSourceIntakeRoute({
    fileName,
    text,
    selectedSourceType,
  });

  if (!route.ok) {
    return bridgeBlocked({
      route,
      code: 'UXML-INTAKE-NO-ROUTE',
      message: route.reason,
    });
  }

  if (route.sourceType === UXML_SOURCE_TYPES.PCF) {
    const pcfBridge = convertPcfTextToStandardXml(text, {
      fileName,
      defaultPipelineRef: converterOptions.defaultPipelineRef || '/PCF-IMPORT',
    });

    const normalized = normalizeXmlToUxml(pcfBridge.standardXml, {
      fileName: `${fileName || 'pcf-import'}.standard.xml`,
      selectedSourceType: XML_PROFILES.STANDARD_XML || 'STANDARD_XML',
      profileReport: {
        profile: XML_PROFILES.STANDARD_XML || 'STANDARD_XML',
        confidence: 'HIGH',
        blockers: [],
      },
    });

    return {
      schema: UXML_SOURCE_INTAKE_BRIDGE_SCHEMA,
      ok: normalized.ok === true,
      blocked: normalized.ok !== true,
      route,
      pcfBridge,
      bridgeOutputProfile: XML_PROFILES.STANDARD_XML || 'STANDARD_XML',
      bridgeOutputText: pcfBridge.standardXml,
      normalized,
      diagnostics: normalized.uxml?.diagnostics || [],
      generatedPcf: false,
      pcfTextByPipelineRef: undefined,
      masterResolution: undefined,
      masterResolutionRequests: undefined,
    };
  }

  if (route.strategy === 'EXISTING_CONVERTER_BRIDGE') {
    if (typeof converterExecutor !== 'function') {
      return bridgeBlocked({
        route,
        code: `UXML-INTAKE-${route.sourceType}-CONVERTER-EXECUTOR-MISSING`,
        message: `${route.sourceType} intake requires an existing converter executor for ${route.bridgeConverterId}.`,
        details: {
          bridgeConverterId: route.bridgeConverterId,
        },
      });
    }

    const converterResult = await invokeConverterBridge({
      converterExecutor,
      bridgeConverterId: route.bridgeConverterId,
      sourceText: text,
      sourceFile,
      sourceBlob,
      sourceArrayBuffer,
      fileName,
      converterOptions,
    });

    const bridgeOutputText = extractConverterOutputText(converterResult);

    if (!bridgeOutputText.trim()) {
      return bridgeBlocked({
        route,
        code: `UXML-INTAKE-${route.sourceType}-CONVERTER-EMPTY-OUTPUT`,
        message: `${route.bridgeConverterId} converter returned no XML text.`,
        details: {
          converterId: route.bridgeConverterId,
        },
      });
    }

    const normalized = normalizeXmlToUxml(bridgeOutputText, {
      fileName: `${fileName || `${String(route.sourceType || 'source').toLowerCase()}-import`}.input.xml`,
      selectedSourceType: XML_PROFILES.INPUT_XML || 'INPUT_XML',
      profileReport: {
        profile: XML_PROFILES.INPUT_XML || 'INPUT_XML',
        confidence: 'HIGH',
        blockers: [],
      },
    });

    return {
      schema: UXML_SOURCE_INTAKE_BRIDGE_SCHEMA,
      ok: normalized.ok === true,
      blocked: normalized.ok !== true,
      route,
      converterResult,
      bridgeOutputProfile: XML_PROFILES.INPUT_XML || 'INPUT_XML',
      bridgeOutputText,
      normalized,
      diagnostics: normalized.uxml?.diagnostics || [],
      generatedPcf: false,
      pcfTextByPipelineRef: undefined,
      masterResolution: undefined,
      masterResolutionRequests: undefined,
    };
  }

  if (route.strategy === 'DIRECT_XML_NORMALIZATION' || route.strategy === 'DIRECT_UXML_NORMALIZATION') {
    const normalized = normalizeXmlToUxml(text, {
      fileName,
      selectedSourceType: route.directProfile,
      profileReport: {
        profile: route.directProfile,
        confidence: 'HIGH',
        blockers: [],
      },
    });

    return {
      schema: UXML_SOURCE_INTAKE_BRIDGE_SCHEMA,
      ok: normalized.ok === true,
      blocked: normalized.ok !== true,
      route,
      bridgeOutputProfile: route.directProfile,
      bridgeOutputText: text,
      normalized,
      diagnostics: normalized.uxml?.diagnostics || [],
      generatedPcf: false,
      pcfTextByPipelineRef: undefined,
      masterResolution: undefined,
      masterResolutionRequests: undefined,
    };
  }

  return bridgeBlocked({
    route,
    code: 'UXML-INTAKE-UNSUPPORTED-STRATEGY',
    message: `Unsupported intake strategy ${route.strategy}.`,
  });
}
