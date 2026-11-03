import { XML_PROFILES } from './UxmlConstants.js';

function clean(value) {
  return String(value ?? '').trim();
}

function lower(value) {
  return clean(value).toLowerCase();
}

function extractRootName(text) {
  const cleaned = String(text || '')
    .replace(/^\uFEFF/, '')
    .replace(/<\?xml[\s\S]*?\?>/i, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim();

  const match = cleaned.match(/^<\s*([A-Za-z_:][\w:.-]*)\b/);
  return match ? match[1] : '';
}

function looksLikeInputXml(text, options = {}) {
  const t = String(text || '');
  const low = t.toLowerCase();
  const fileName = lower(options.fileName || '');

  if (fileName.includes('input') && fileName.endsWith('.xml')) return true;

  if (low.includes('<inputxml')) return true;
  if (low.includes('<caesarii') && low.includes('<pipingelement')) return true;

  const root = lower(extractRootName(t));

  if (
    root.includes('inputxml') ||
    root.includes('input-xml') ||
    root.includes('input_xml')
  ) {
    return true;
  }

  // AVEVA/CII/Input XML variants often do not use literal <InputXML>.
  // Detect conservatively using common coordinate/component signal clusters.
  const hasXml = t.trimStart().startsWith('<');
  const hasCoordinateSignals =
    /<\s*(?:[\w.-]+:)?(?:node|point|coordinate|coord|position|pos)\b/i.test(t) ||
    /\b(?:x|X|e|E)\s*=/.test(t) && /\b(?:y|Y|n|N)\s*=/.test(t) && /\b(?:z|Z|elev|ELEV)\s*=/.test(t);

  const hasComponentSignals =
    /<\s*(?:[\w.-]+:)?(?:element|pipeelement|member|component|pipe|fitting|support|branch|tee|olet|valve|flange|reducer)\b/i.test(t);

  const hasPipelineSignals =
    /\b(?:pipeline|pipelineRef|lineNo|line-no|line)\s*=/i.test(t) ||
    /<\s*(?:[\w.-]+:)?(?:pipeline|line)\b/i.test(t);

  return hasXml && hasCoordinateSignals && hasComponentSignals && hasPipelineSignals;
}

export function detectUxmlProfile(xmlText, options = {}) {
  const text = String(xmlText || '').trim();

  if (!text) {
    return {
      profile: XML_PROFILES.UNKNOWN_XML,
      blockers: ['EMPTY_INPUT'],
      confidence: 'NONE',
      rootName: '',
    };
  }

  const rootName = extractRootName(text);

  if (text.includes('<UXML')) {
    return {
      profile: XML_PROFILES.UXML,
      blockers: [],
      confidence: 'HIGH',
      rootName,
    };
  }

  if (text.includes('<Project') && (text.includes('<Component') || text.includes('<Pipe'))) {
    return {
      profile: XML_PROFILES.STANDARD_XML,
      blockers: [],
      confidence: 'HIGH',
      rootName,
    };
  }

  if (looksLikeInputXml(text, options)) {
    return {
      profile: XML_PROFILES.INPUT_XML,
      blockers: [],
      confidence: text.includes('<InputXML') ? 'HIGH' : 'MEDIUM',
      rootName,
    };
  }

  if (text.includes('<BenchmarkCase') && text.includes('<ExpectedResult')) {
    return {
      profile: XML_PROFILES.BENCHMARK_XML,
      blockers: ['BENCHMARK_ONLY'],
      confidence: 'HIGH',
      rootName,
    };
  }

  if (text.startsWith('<')) {
    return {
      profile: XML_PROFILES.UNKNOWN_XML,
      blockers: ['UNKNOWN_XML_SCHEMA'],
      confidence: 'LOW',
      rootName,
    };
  }

  return {
    profile: XML_PROFILES.UNKNOWN_XML,
    blockers: ['NOT_XML'],
    confidence: 'NONE',
    rootName,
  };
}

export function assertXmlProfileBuildAllowed(profileReport) {
  if (profileReport.profile === XML_PROFILES.UNKNOWN_XML) {
    return { ok: false, message: 'Unknown XML profile.' };
  }

  if (
    profileReport.blockers &&
    profileReport.blockers.length > 0 &&
    profileReport.profile !== XML_PROFILES.BENCHMARK_XML
  ) {
    return { ok: false, message: 'Build blocked by profile detector.' };
  }

  return { ok: true, message: 'Build allowed.' };
}

export function detectXmlProfile(xmlText, options = {}) {
  const report = detectUxmlProfile(xmlText, options);

  return {
    ...report,
    isXml: report.profile !== XML_PROFILES.UNKNOWN_XML || !report.blockers.includes('NOT_XML'),
    isKnownProfile: report.profile !== XML_PROFILES.UNKNOWN_XML,
    shouldBlockTopologyBuild: !assertXmlProfileBuildAllowed(report).ok,
    stats: {
      profile: report.profile,
      confidence: report.confidence,
      blockerCount: report.blockers.length,
      rootName: report.rootName || '',
    },
  };
}
