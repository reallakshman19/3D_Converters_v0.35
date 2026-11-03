/**
 * 3DV_PCFSerializer.js
 * Converts a components[] array back into PCF text — the inverse of pcf-parser.js.
 * Mirrors the _exportPcfFromTable logic in viewer-tab.js for consistency.
 */

const f4 = (v) => Number(v).toFixed(4);
const MSG = 'MESSAGE-SQUARE';
// These coordinate keywords are written explicitly above — never duplicated from attributes
const GEOMETRY_KEYS = new Set(['END-POINT', 'CO-ORDS', 'CENTRE-POINT', 'BRANCH1-POINT']);

/**
 * Serialize components array to PCF text string.
 * @param {object[]} components - parsed component objects (same shape as pcf-parser output)
 * @returns {string}
 */
export function serializeToPCF(components) {
    if (!components || components.length === 0) return '';
    const lines = [];

    for (const comp of components) {
        const type = (comp.type || 'UNKNOWN').toUpperCase();

        // MESSAGE-SQUARE blocks — annotation text only (no coord lines)
        if (type === MSG) {
            lines.push(MSG);
            // Prefer the normalised squareText field; fall back to first attribute value
            const text = comp.squareText
                || (Object.values(comp.attributes || {})[0] ?? '');
            if (text) lines.push(`    ${text}`);
            lines.push('');
            continue;
        }

        // Component keyword
        lines.push(type);

        // END-POINTs  (comp.points = [{x,y,z,bore}])
        for (const pt of (comp.points || [])) {
            const bore = f4(pt.bore || comp.bore || 0);
            lines.push(`    END-POINT  ${f4(pt.x)} ${f4(pt.y)} ${f4(pt.z)} ${bore}`);
        }

        // CENTRE-POINT (elbows, bends)
        if (comp.centrePoint) {
            const cp = comp.centrePoint;
            lines.push(`    CENTRE-POINT  ${f4(cp.x)} ${f4(cp.y)} ${f4(cp.z)}`);
        }

        // BRANCH1-POINT (tees, olets)
        if (comp.branch1Point) {
            const bp = comp.branch1Point;
            lines.push(`    BRANCH1-POINT  ${f4(bp.x)} ${f4(bp.y)} ${f4(bp.z)} ${f4(bp.bore || 0)}`);
        }

        // CO-ORDS (supports)
        if (comp.coOrds) {
            const co = comp.coOrds;
            lines.push(`    CO-ORDS  ${f4(co.x)} ${f4(co.y)} ${f4(co.z)}`);
        }

        // All remaining attributes (SKEY, BORE, PIPELINE-REFERENCE, COMPONENT-ATTRIBUTEn …)
        // Skip geometry keys — those are already emitted as dedicated lines above
        for (const [k, v] of Object.entries(comp.attributes || {})) {
            if (GEOMETRY_KEYS.has(k)) continue;
            lines.push(v !== '' ? `    ${k}  ${v}` : `    ${k}`);
        }

        lines.push(''); // blank line between components
    }

    return lines.join('\n');
}
