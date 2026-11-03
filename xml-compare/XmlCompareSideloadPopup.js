export const XML_COMPARE_SIDELOAD_POPUP_SCHEMA='xml-compare-sideload-popup/v3';

const esc=(value)=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');

function reportRows(report){
  if(!report)return '<div class="xml-compare-sideload-empty">Apply or export to see sideload counts.</div>';
  const rows=[['LINE_ID rows',report.lineIdRows],['LINE_ID applied',report.lineIdsApplied],['FROM/TO name rows',report.nodeNameRows],['FROM/TO names applied',report.nodeNamesApplied],['Restraint tag rows',report.tagRows],['Restraint tags applied',report.tagsApplied],['Table 4 coordinate rows',report.coordinateRows],['Global coordinates applied',report.coordinatesApplied],['Coordinate nodes resolved',report.coordinateNodesResolved],['Coordinate diagnostics',report.coordinateDiagnostics]];
  if(report.enrichment){const e=report.enrichment;if(e.restraintTypeConverted)rows.push(['Restraint type converted',e.restraintTypeConverted]);if(e.pipingClassApplied)rows.push(['PipingClass enriched',e.pipingClassApplied]);if(e.ratingApplied)rows.push(['Rating enriched',e.ratingApplied]);if(e.componentTypeApplied)rows.push(['ComponentType enriched',e.componentTypeApplied]);if(e.dtxrApplied)rows.push(['DTXR enriched',e.dtxrApplied]);if(e.pointBasisApplied)rows.push(['PointBasis enriched',e.pointBasisApplied]);if(e.positionApplied)rows.push(['Position enriched',e.positionApplied]);}
  return `<dl class="xml-compare-sideload-report">${rows.map(([name,value])=>`<div><dt>${esc(name)}</dt><dd>${esc(value??0)}</dd></div>`).join('')}</dl>`;
}

export function renderXmlCompareSideloadPopupHtml(state={}){
  if(!state.open)return '';
  const side=state.side==='b'?'b':'a';
  return `<div class="xml-compare-sideload-backdrop" data-xml-compare-sideload-popup>
    <section class="xml-compare-sideload-dialog" role="dialog" aria-modal="true" aria-label="Sideload XML enrichment">
      <header><div><h3>Sideload XML enrichment</h3><p>Paste lookup data, patch the loaded XML, then export a SideloadedXML file.</p></div><button type="button" data-xml-compare-action="close-sideload">Close</button></header>
      <div class="xml-compare-sideload-target"><label>Patch loaded file<select data-xml-compare-sideload-side><option value="a" ${side==='a'?'selected':''}>Source A</option><option value="b" ${side==='b'?'selected':''}>Target B</option></select></label></div>
      <div class="xml-compare-sideload-grid">
        <label>1. FROM_NODE, TO_NODE, LINE_ID<textarea data-xml-compare-sideload-field="lineIdText" spellcheck="false" placeholder="FROM_NODE&#9;TO_NODE&#9;LINE_ID">${esc(state.lineIdText)}</textarea></label>
        <label>2. FROM_NODE, TO_NODE, FROM_NAME, TO_NAME<textarea data-xml-compare-sideload-field="nodeNameText" spellcheck="false" placeholder="FROM_NODE&#9;TO_NODE&#9;FROM_NAME&#9;TO_NAME">${esc(state.nodeNameText)}</textarea></label>
        <label>3. FROM_NODE, TO_NODE, NODE, TYPE, STIFFNESS, GAP, MU, CNODE, TAG<textarea data-xml-compare-sideload-field="restraintTagText" spellcheck="false" placeholder="FROM_NODE&#9;TO_NODE&#9;NODE&#9;TYPE&#9;STIFFNESS&#9;GAP&#9;MU&#9;CNODE&#9;TAG">${esc(state.restraintTagText)}</textarea></label>
        <label>Table 4 — Node Global Coordinates<textarea data-xml-compare-sideload-field="coordinateText" spellcheck="false" placeholder="Node    Global X    Global Y    Global Z&#10;10      23227.580 mm.  3257.150 mm.  -19800.000 mm.">${esc(state.coordinateText)}</textarea></label>
      </div>
      <footer>${reportRows(state.lastReport)}<div class="xml-compare-sideload-actions"><button type="button" data-xml-compare-action="apply-sideload">Apply to loaded XML</button><button type="button" data-xml-compare-action="export-sideload">Export SideloadedXML</button></div></footer>
    </section>
  </div>`;
}

export const _test=Object.freeze({esc,reportRows});
