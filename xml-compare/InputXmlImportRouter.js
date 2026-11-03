/**
 * InputXmlImportRouter.js
 *
 * Common public router for InputXML import. Selects between the native XML
 * builder and the UXML round-trip route.
 */

import { parse } from '../parser/caesar-parser.js';
import {
  INPUTXML_IMPORT_ROUTES,
  inputXmlImportRouteLabel,
  normalizeInputXmlImportRoute,
} from './InputXmlImportRoutes.js';
import { buildNativeXmlDirectData } from '../js/pcf2glb/import/NativeXmlDirectBuilder.js';
import { runInputXmlUxmlRoundTrip } from './InputXmlUxmlRoundTripRoute.js';

function clean(value) {
  return String(value ?? '').trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function createFallbackDirectPcfData(fileName, components, parsed) {
  return {
    kind: 'inputxml-router-direct',
    fileName,
    components,
    parsed: parsed || {},
    messageCircleNodes: [],
    messageSquareNodes: [],
  };
}

export function inputXmlRouteDiagnostics(route, diagnostics = []) {
  return [
    {
      severity: 'INFO',
      code: `INPUTXML-ROUTE-${route}`,
      message: `InputXML imported via ${inputXmlImportRouteLabel(route)}.`,
      route,
    },
    ...asArray(diagnostics),
  ];
}

export function normalizeInputXmlImportResult(result, options = {}) {
  const route = normalizeInputXmlImportRoute(result?.route || options.route);
  const components = asArray(result?.components || result?.directPcfData?.components);
  const fileName = clean(result?.fileName || options.fileName || 'input.xml');

  return {
    schema: 'inputxml-import-router/v1',
    ok: result?.ok !== false,
    route,
    routeLabel: inputXmlImportRouteLabel(route),
    fileName,
    directPcfData: result?.directPcfData || createFallbackDirectPcfData(fileName, components, result?.parsed),
    components,
    diagnostics: inputXmlRouteDiagnostics(route, result?.diagnostics),
    native: result?.native || null,
    uxmlRoundTrip: result?.uxmlRoundTrip || null,
    summary: result?.summary || {
      route,
      componentCount: components.length,
    },
  };
}

export function importInputXmlByRoute(xmlText, options = {}) {
  const route = normalizeInputXmlImportRoute(options.route);
  const fileName = clean(options.fileName || 'input.xml');
  const text = clean(xmlText);

  if (!text) {
    return normalizeInputXmlImportResult({
      ok: false,
      route,
      fileName,
      components: [],
      diagnostics: [
        {
          severity: 'ERROR',
          code: 'INPUTXML-EMPTY',
          message: 'InputXML text is empty.',
        },
      ],
      summary: {
        route,
        componentCount: 0,
        failed: true,
      },
    }, options);
  }

  if (route === INPUTXML_IMPORT_ROUTES.NATIVE_XML_BUILDER) {
    const parsed = parse(text, fileName);
    const directPcfData = buildNativeXmlDirectData(parsed, fileName, options.defaults || {});
    const components = asArray(directPcfData?.components);

    return normalizeInputXmlImportResult({
      ok: true,
      route,
      fileName,
      parsed,
      directPcfData,
      components,
      native: {
        parsedFormat: parsed?.format || '',
        componentCount: components.length,
      },
      diagnostics: [
        {
          severity: 'INFO',
          code: 'INPUTXML-NATIVE-XML-BUILDER',
          message: 'InputXML imported through the native XML builder.',
        },
      ],
      summary: {
        route,
        routeLabel: inputXmlImportRouteLabel(route),
        componentCount: components.length,
        parsedFormat: parsed?.format || '',
        nativeBuilder: true,
      },
    }, options);
  }

  const roundTrip = runInputXmlUxmlRoundTrip(text, {
    ...options,
    fileName,
  });

  const components = asArray(roundTrip?.components);

  return normalizeInputXmlImportResult({
    ok: roundTrip?.ok !== false,
    route,
    fileName,
    directPcfData: {
      kind: 'inputxml-uxml-roundtrip-direct',
      fileName,
      components,
      parsed: {
        route,
        profile: roundTrip?.profile || '',
        uxml: roundTrip?.uxml || null,
        topologyDecision: roundTrip?.topologyDecision || null,
      },
      messageCircleNodes: [],
      messageSquareNodes: [],
    },
    components,
    uxmlRoundTrip: roundTrip,
    diagnostics: roundTrip?.diagnostics || [],
    summary: {
      ...(roundTrip?.summary || {}),
      route,
      routeLabel: inputXmlImportRouteLabel(route),
      componentCount: components.length,
      uxmlRoundTrip: true,
    },
  }, options);
}
