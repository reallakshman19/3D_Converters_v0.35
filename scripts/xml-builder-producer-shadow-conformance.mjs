import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { installSimpleXmlDom } from '../tests/helpers/simple-xml-dom.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = dirname(SCRIPT_DIR);
const PIN_PATH = join(REPOSITORY_ROOT, 'contracts', 'xml-builder-producer-conformance', 'v1', 'pin.json');

function argument(name, fallback = '') {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || fallback) : fallback;
}

function sha256(value) {
  return createHash('sha256').update(String(value ?? ''), 'utf8').digest('hex');
}

function gitHead(root) {
  return execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
}

function pipingElementCount(value) {
  return (String(value ?? '').match(/<PIPINGELEMENT\b/gi) || []).length;
}

function firstDifference(left, right) {
  const a = String(left ?? '');
  const b = String(right ?? '');
  const length = Math.min(a.length, b.length);
  let index = 0;
  while (index < length && a[index] === b[index]) index += 1;
  if (index === a.length && index === b.length) return null;
  return Object.freeze({
    index,
    left: a.slice(Math.max(0, index - 80), index + 160),
    right: b.slice(Math.max(0, index - 80), index + 160),
    leftLength: a.length,
    rightLength: b.length,
  });
}

async function prepareLocalEsmFixture() {
  const root = await mkdtemp(join(tmpdir(), 'xml-builder-shadow-conformance-'));
  await writeFile(join(root, 'package.json'), '{"type":"module"}\n', 'utf8');
  const paths = [
    'converters/xml-cii2019-core',
    'tabs/model-converters/xml-cii-node-to-inputxml-core.js',
    'tabs/model-converters/xml-cii-node-to-inputxml-audit.js',
    'tabs/model-converters/xml-cii-node-to-inputxml-topology-normalizer.js',
    'tabs/xml-cii-2019-standalone',
    'xml-compare/CategorizedInputXmlConverter.js',
    'xml-compare/XmlCompareCoordinateSideload.js',
    'xml-compare/XmlCompareCoordinateDiagnostics.js',
  ];
  for (const relativePath of paths) {
    const source = join(REPOSITORY_ROOT, relativePath);
    const target = join(root, relativePath);
    await mkdir(dirname(target), { recursive: true });
    await cp(source, target, { recursive: true });
  }
  return root;
}

function sampleTables() {
  const branchName = '/CUSTOM-4"-P8810212-31441C4-PP/B1';
  return Object.freeze({
    branchRows: Object.freeze([Object.freeze({
      branchName,
      lineKey: '4-P8810212-31441C4-PP',
      nodeNumber: '100',
      boreMm: '100',
      outsideDiameter: '114.3',
      wallThickness: '6.02',
      p1: '4140',
      p9: '900',
      t1: '260',
      t2: '151',
      t3: '5',
      t9: '9',
      fluidDensity: '983',
      insulationDensity: '0.00012',
    })]),
    coordinateRows: Object.freeze([
      Object.freeze({ branchName, nodeNumber: '100', x: '200000', y: '-1098000', z: '101000' }),
      Object.freeze({ branchName, nodeNumber: '110', x: '200500', y: '-1098000', z: '101000' }),
    ]),
    weightRows: Object.freeze([
      Object.freeze({ branchName, nodeNumber: '100', componentType: 'PIPE', rigid: '0', endpoint: '1', weight: '0', componentRefNo: 'P-100' }),
      Object.freeze({ branchName, nodeNumber: '110', componentType: 'RIGID', rigid: '2', endpoint: '2', weight: '43', componentRefNo: 'V-110' }),
    ]),
    restraintRows: Object.freeze([
      Object.freeze({ branchName, nodeNumber: '110', nodeName: 'PS-1001', restraintType: 'REST', gap: '0', stiffness: '1.751270E+12', friction: '0.3', direction: '+Y' }),
    ]),
    dtxrRows: Object.freeze([
      Object.freeze({ branchName, nodeNumber: '110', dtxr: 'GATE VALVE FLGD 300#' }),
    ]),
  });
}

async function readLocalAuthorityPin(pin) {
  const manifestPath = join(REPOSITORY_ROOT, String(pin.localAuthorityManifest || ''));
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const valid = manifest.schema === 'categorized-inputxml-authority-pin/v1'
    && manifest.mode === 'exact-vendored-authority'
    && manifest.sourceRepository === pin.sourceRepository
    && manifest.sourceCommit === pin.requiredLocalAuthorityCommit
    && manifest.sourceCommit === pin.sourceCommit;
  if (!valid) {
    throw Object.assign(new Error('Local CategorizedInputXML authority manifest does not match the required upstream pin.'), {
      code: 'LOCAL_AUTHORITY_PIN_MISMATCH',
    });
  }
  return Object.freeze({ path: pin.localAuthorityManifest, ...manifest });
}

async function loadAuthorities(localFixtureRoot, xmlUtilitiesRoot, pin) {
  const localApi = await import(pathToFileURL(join(localFixtureRoot, 'converters/xml-cii2019-core/custom-input-api.js')).href);
  const localCore = await import(pathToFileURL(join(localFixtureRoot, 'tabs/model-converters/xml-cii-node-to-inputxml-core.js')).href);
  const localCategorizer = await import(pathToFileURL(join(localFixtureRoot, 'xml-compare/CategorizedInputXmlConverter.js')).href);
  const upstreamService = await import(pathToFileURL(join(xmlUtilitiesRoot, pin.serviceEntrypoint)).href);
  return Object.freeze({ localApi, localCore, localCategorizer, upstreamService });
}

function buildInputXml(authorities) {
  const options = Object.freeze({ dropShortElementLengthNodes: false });
  const nodeXml = authorities.localApi.buildXmlCiiCustomInputXml(sampleTables(), options);
  const inputXml = authorities.localCore.buildInputXmlFromNodeXml(nodeXml.xmlText, {
    applyEnrichment: false,
    buildProfile: 'xml-builder-shadow-conformance',
    jobName: 'XML_BUILDER_SHADOW_CONFORMANCE',
    sourceName: 'xml-builder-shadow-generated.xml',
  });
  const text = inputXml.finalInputXmlText || inputXml.coreInputXmlText || '';
  return Object.freeze({ nodeXml, inputXml, text });
}

function createRequest(pin, inputXmlText) {
  return Object.freeze({
    schema: pin.requestSchema,
    requestId: `xml-builder-shadow-${sha256(inputXmlText).slice(0, 16)}`,
    producer: Object.freeze({ ...pin.producer }),
    source: Object.freeze({
      filename: 'xml-builder-shadow-conformance.input.xml',
      content: inputXmlText,
    }),
  });
}

async function runConformance(xmlUtilitiesRoot, evidencePath) {
  installSimpleXmlDom();
  const pin = JSON.parse(await readFile(PIN_PATH, 'utf8'));
  const upstreamCommit = gitHead(xmlUtilitiesRoot);
  const localCommit = gitHead(REPOSITORY_ROOT);
  const localFixtureRoot = await prepareLocalEsmFixture();
  let localAuthority = null;
  let evidence;
  try {
    if (upstreamCommit !== pin.sourceCommit) {
      throw Object.assign(new Error(`Pinned XML Utilities commit mismatch: expected ${pin.sourceCommit}, observed ${upstreamCommit}.`), { code: 'UPSTREAM_COMMIT_MISMATCH' });
    }
    localAuthority = await readLocalAuthorityPin(pin);
    const authorities = await loadAuthorities(localFixtureRoot, xmlUtilitiesRoot, pin);
    const generated = buildInputXml(authorities);
    const elementCount = pipingElementCount(generated.text);
    if (!generated.inputXml.ok || elementCount < 1) {
      throw Object.assign(new Error('The real XML Builder chain produced no PIPINGELEMENT records.'), { code: 'XML_BUILDER_ZERO_ROUTE' });
    }
    if (!/<CAESARII\b[^>]*XML_TYPE="Input"/i.test(generated.text)) {
      throw Object.assign(new Error('The XML Builder output is not CAESARII InputXML.'), { code: 'XML_BUILDER_INPUTXML_INVALID' });
    }

    const request = createRequest(pin, generated.text);
    const service = authorities.upstreamService.createInputXmlProducerService();
    const result = service.categorizeInputXml(request);
    const localCategorizedText = authorities.localCategorizer.inputXmlToCategorizedInputXml(generated.text, {
      sourceName: request.source.filename,
    });
    const upstreamCategorizedText = String(result?.artifact?.text || '');
    const difference = firstDifference(localCategorizedText, upstreamCategorizedText);
    const checks = Object.freeze({
      localAuthorityPinned: localAuthority.sourceCommit === pin.sourceCommit,
      upstreamSuccess: result?.success === true,
      resultSchema: result?.schema === pin.resultSchema,
      artifactRole: result?.artifact?.role === pin.artifactRole,
      validationPass: result?.categorizedValidation?.success === true,
      sourceFingerprintBound: result?.artifact?.sourceFingerprint === result?.source?.fingerprint,
      inputElementCount: Number(result?.summary?.inputElements || 0) === elementCount,
      categorizedElementCount: Number(result?.summary?.categorizedElements || 0) === elementCount,
      localUpstreamByteParity: difference === null,
    });
    const failedChecks = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
    evidence = {
      schema: 'xml-builder-producer-shadow-conformance-evidence/v1',
      status: failedChecks.length ? 'BLOCKED' : 'PASS',
      mode: pin.mode,
      localRepository: 'reallaksh19/3D_Converters',
      localCommit,
      localAuthority: {
        manifestPath: localAuthority.path,
        schema: localAuthority.schema,
        mode: localAuthority.mode,
        sourceRepository: localAuthority.sourceRepository,
        sourceCommit: localAuthority.sourceCommit,
        files: localAuthority.files,
      },
      upstreamRepository: pin.sourceRepository,
      upstreamCommit,
      serviceEntrypoint: pin.serviceEntrypoint,
      producer: request.producer,
      source: {
        filename: request.source.filename,
        bytes: Buffer.byteLength(generated.text, 'utf8'),
        sha256: sha256(generated.text),
        pipingElements: elementCount,
        diagnostics: generated.inputXml.diagnostics?.summary || null,
      },
      localCategorized: {
        bytes: Buffer.byteLength(localCategorizedText, 'utf8'),
        sha256: sha256(localCategorizedText),
      },
      upstreamResult: {
        schema: result?.schema || null,
        requestId: result?.requestId || null,
        success: result?.success === true,
        summary: result?.summary || null,
        diagnosticCounts: result?.diagnosticCounts || null,
        diagnostics: result?.diagnostics || [],
        categorizedValidation: result?.categorizedValidation || null,
        artifact: result?.artifact ? {
          role: result.artifact.role,
          filename: result.artifact.filename,
          bytes: Buffer.byteLength(upstreamCategorizedText, 'utf8'),
          sha256: sha256(upstreamCategorizedText),
          sourceFingerprint: result.artifact.sourceFingerprint,
        } : null,
      },
      checks,
      failedChecks,
      firstDifference: difference,
      productionSwitchAuthorized: pin.switchAuthorized,
      protectedAuthorities: pin.protectedAuthorities,
    };
    if (failedChecks.length) {
      throw Object.assign(new Error(`XML Builder producer conformance blocked: ${failedChecks.join(', ')}.`), { code: 'SHADOW_CONFORMANCE_BLOCKED', evidenceReady: true });
    }
  } catch (error) {
    if (!evidence) {
      evidence = {
        schema: 'xml-builder-producer-shadow-conformance-evidence/v1',
        status: 'BLOCKED',
        mode: 'shadow-only',
        localRepository: 'reallaksh19/3D_Converters',
        localCommit,
        localAuthority: localAuthority ? {
          manifestPath: localAuthority.path,
          sourceRepository: localAuthority.sourceRepository,
          sourceCommit: localAuthority.sourceCommit,
        } : null,
        upstreamRepository: pin.sourceRepository,
        upstreamCommit,
        error: { code: error?.code || 'SHADOW_CONFORMANCE_FAILED', message: error?.message || String(error) },
        productionSwitchAuthorized: false,
      };
    } else {
      evidence.error = { code: error?.code || 'SHADOW_CONFORMANCE_BLOCKED', message: error?.message || String(error) };
    }
    await mkdir(dirname(evidencePath), { recursive: true });
    await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
    throw error;
  } finally {
    await rm(localFixtureRoot, { recursive: true, force: true });
  }
  await mkdir(dirname(evidencePath), { recursive: true });
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  return evidence;
}

const xmlUtilitiesRoot = resolve(argument('--xml-utils-root', join(REPOSITORY_ROOT, '..', 'XML_Compare_Utilities')));
const evidencePath = resolve(argument('--evidence', join(REPOSITORY_ROOT, 'artifacts', 'xml-builder-producer-shadow-conformance.json')));

try {
  const evidence = await runConformance(xmlUtilitiesRoot, evidencePath);
  console.log(`XML Builder producer shadow conformance ${evidence.status}.`);
  console.log(`Evidence: ${evidencePath}`);
} catch (error) {
  console.error(error?.stack || error?.message || String(error));
  console.error(`Evidence: ${evidencePath}`);
  process.exitCode = 1;
}

export const _test = Object.freeze({ argument, sha256, pipingElementCount, firstDifference, sampleTables, readLocalAuthorityPin, createRequest, runConformance });
