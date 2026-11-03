export function renderMasterCandidateComparisonMarkup() {
  return `
<section class="uew-panel" aria-labelledby="uew-comparison-title">
  <h2 id="uew-comparison-title">Master Candidate Comparison</h2><p>Bind candidate field keys to columns in currently attached immutable master datasets. Comparisons do not rank, select or apply values.</p>
  <div class="uew-actions"><button id="uew-comparison-add-binding" type="button">Add binding</button><button id="uew-comparison-build-config" type="button">Build configuration</button><button id="uew-comparison-config-download" type="button" disabled>Download config JSON</button><button id="uew-comparison-run" type="button" disabled>Run comparison</button><button id="uew-comparison-run-download" type="button" disabled>Download run JSON</button><button id="uew-comparison-csv-download" type="button" disabled>Comparison CSV</button><button id="uew-comparison-match-csv-download" type="button" disabled>Match CSV</button></div>
  <p>Status: <strong id="uew-comparison-status">Not configured</strong></p>
  <div class="uew-table-wrap"><table><thead><tr><th>On</th><th>Field</th><th>Dataset</th><th>Column</th><th>Mode</th><th>Normalize</th><th>Order</th><th></th></tr></thead><tbody id="uew-comparison-binding-list"></tbody></table></div>
  <div class="uew-summary-grid"><span>Config <strong id="uew-comparison-config-id">—</strong></span><span>Run <strong id="uew-comparison-run-id">—</strong></span><span>Comparisons <strong id="uew-comparison-count">0</strong></span><span>Unique <strong id="uew-comparison-unique-count">0</strong></span><span>Multiple <strong id="uew-comparison-multiple-count">0</strong></span><span>Unmatched <strong id="uew-comparison-unmatched-count">0</strong></span><span>Unbound <strong id="uew-comparison-unbound-count">0</strong></span></div>
  <div class="uew-filters"><label>View <select id="uew-comparison-view"><option value="unique">Unique</option><option value="multiple">Multiple</option><option value="unmatched">Unmatched</option><option value="unbound">Unbound</option><option value="diagnostics">Diagnostics</option></select></label><label>Entity <input id="uew-comparison-entity-filter" type="search"></label><label>Field <input id="uew-comparison-field-filter" type="search"></label><label>Dataset <input id="uew-comparison-dataset-filter" type="search"></label><label>Search <input id="uew-comparison-search" type="search"></label></div>
  <div class="uew-table-wrap"><table><thead><tr><th>#</th><th>Entity</th><th>Field</th><th>Candidate</th><th>Dataset</th><th>Status</th><th>Matches</th></tr></thead><tbody id="uew-comparison-result-list"></tbody></table></div>
  <div class="uew-pager"><button id="uew-comparison-prev" type="button">Previous</button><span id="uew-comparison-visible-count">0</span><button id="uew-comparison-next" type="button">Next</button></div>
  <h3>Selected result</h3><pre id="uew-comparison-details">None</pre>
  <div class="uew-table-wrap"><table><thead><tr><th>Row</th><th>Order</th><th>Master value</th><th>Normalized</th></tr></thead><tbody id="uew-comparison-match-list"></tbody></table></div>
  <button id="uew-comparison-match-more" type="button" disabled>Show 200 more matches</button>
  <div class="uew-findings"><div><h3>Errors</h3><ul id="uew-comparison-errors"></ul></div><div><h3>Warnings</h3><ul id="uew-comparison-warnings"></ul></div></div>
</section>`;
}
