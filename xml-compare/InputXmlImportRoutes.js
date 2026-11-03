/**
 * InputXmlImportRoutes.js
 *
 * Route constants for InputXML/XML import in the normal 3D Viewer and XML Compare.
 *
 * This module intentionally does not import RVM modules.
 */

export const INPUTXML_IMPORT_ROUTES = Object.freeze({
  NATIVE_XML_BUILDER: 'NATIVE_XML_BUILDER',
  UXML_ROUND_TRIP: 'UXML_ROUND_TRIP',
});

export const INPUTXML_IMPORT_ROUTE_STORAGE_KEY = 'viewer3d_inputxml_import_route';

export const DEFAULT_INPUTXML_IMPORT_ROUTE = (() => {
  try {
    const stored = localStorage.getItem(INPUTXML_IMPORT_ROUTE_STORAGE_KEY);

    if (stored === INPUTXML_IMPORT_ROUTES.NATIVE_XML_BUILDER) {
      return INPUTXML_IMPORT_ROUTES.NATIVE_XML_BUILDER;
    }

    if (stored === INPUTXML_IMPORT_ROUTES.UXML_ROUND_TRIP) {
      return INPUTXML_IMPORT_ROUTES.UXML_ROUND_TRIP;
    }
  } catch {
    // localStorage is not available during Node-based tests.
  }

  return INPUTXML_IMPORT_ROUTES.UXML_ROUND_TRIP;
})();

export function normalizeInputXmlImportRoute(value) {
  const route = String(value ?? '').trim().toUpperCase();

  if (route === INPUTXML_IMPORT_ROUTES.NATIVE_XML_BUILDER) {
    return INPUTXML_IMPORT_ROUTES.NATIVE_XML_BUILDER;
  }

  return INPUTXML_IMPORT_ROUTES.UXML_ROUND_TRIP;
}

export function isNativeInputXmlBuilderRoute(value) {
  return normalizeInputXmlImportRoute(value) === INPUTXML_IMPORT_ROUTES.NATIVE_XML_BUILDER;
}

export function isUxmlInputXmlRoundTripRoute(value) {
  return normalizeInputXmlImportRoute(value) === INPUTXML_IMPORT_ROUTES.UXML_ROUND_TRIP;
}

export function inputXmlImportRouteLabel(value) {
  const route = normalizeInputXmlImportRoute(value);

  if (route === INPUTXML_IMPORT_ROUTES.NATIVE_XML_BUILDER) {
    return 'Native XML Builder';
  }

  return 'UXML Round Trip';
}

export function persistInputXmlImportRoute(value) {
  const route = normalizeInputXmlImportRoute(value);

  try {
    localStorage.setItem(INPUTXML_IMPORT_ROUTE_STORAGE_KEY, route);
  } catch {
    // Ignore persistence failures in non-browser environments.
  }

  return route;
}
