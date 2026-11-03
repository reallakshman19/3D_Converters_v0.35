function sourceIntakeMarkup() {
  return `
  <div class="uew-grid">
    <section class="uew-card" aria-labelledby="uew-source-heading">
      <h2 id="uew-source-heading">Authoritative source</h2>
      <div class="uew-controls">
        <label>Source file<input id="uew-file" type="file" accept=".xml,.inputxml,.json,.txt,application/xml,application/json,text/xml,text/plain"></label>
        <label>Source kind<select id="uew-kind"><option value="auto">Auto detect</option><option value="xml">XML</option><option value="inputxml">InputXML</option><option value="stagedjson">StagedJSON</option></select></label>
      </div>
      <label class="uew-editor-label" for="uew-source-text">Paste or edit source text</label>
      <textarea id="uew-source-text" spellcheck="false" placeholder="Paste XML, InputXML or StagedJSON"></textarea>
      <div class="uew-actions"><button id="uew-generate" type="button">Generate envelope</button><button id="uew-download" type="button" disabled>Download JSON</button><button id="uew-clear" type="button" class="uew-secondary">Clear</button></div>
    </section>
    <section class="uew-card" aria-labelledby="uew-summary-heading">
      <h2 id="uew-summary-heading">Identity and validation</h2>
      <dl class="uew-summary">
        <div><dt>Effective kind</dt><dd id="uew-effective-kind">—</dd></div><div><dt>Detected kind</dt><dd id="uew-detected-kind">—</dd></div>
        <div><dt>Source name</dt><dd id="uew-source-name">—</dd></div><div><dt>Origin</dt><dd id="uew-origin">—</dd></div>
        <div><dt>Revision</dt><dd id="uew-revision">0</dd></div><div><dt>Byte length</dt><dd id="uew-byte-length">0</dd></div>
        <div><dt>Root / shape</dt><dd id="uew-root-shape">—</dd></div><div><dt>Status</dt><dd id="uew-status">Not generated</dd></div>
        <div class="uew-wide"><dt>Content hash</dt><dd id="uew-content-hash">—</dd></div><div class="uew-wide"><dt>Source file ID</dt><dd id="uew-source-file-id">—</dd></div>
      </dl>
      <div class="uew-findings"><h3>Errors</h3><ul id="uew-errors"><li>None</li></ul><h3>Warnings</h3><ul id="uew-warnings"><li>None</li></ul></div>
    </section>
  </div>`;
}

function graphSummaryMarkup() {
  return `
    <div class="uew-graph-heading"><div><p class="uew-kicker">Structural evidence</p><h2 id="uew-graph-heading">Universal source graph</h2></div>
      <div class="uew-actions"><button id="uew-graph-build" type="button" disabled>Build Source Graph</button><button id="uew-graph-download" type="button" disabled>Download Graph JSON</button></div></div>
    <dl class="uew-summary uew-graph-summary">
      <div><dt>Status</dt><dd id="uew-graph-status">Not built</dd></div><div><dt>Entities</dt><dd id="uew-graph-entity-count">0</dd></div>
      <div><dt>Roots</dt><dd id="uew-graph-root-count">0</dd></div><div><dt>Maximum depth</dt><dd id="uew-graph-max-depth">0</dd></div>
      <div class="uew-wide"><dt>Kind counts</dt><dd id="uew-graph-kind-counts">—</dd></div>
    </dl>
    <div class="uew-findings uew-graph-findings"><h3>Graph errors</h3><ul id="uew-graph-errors"><li>None</li></ul><h3>Graph warnings</h3><ul id="uew-graph-warnings"><li>None</li></ul></div>`;
}

function graphExplorerMarkup() {
  return `
    <div class="uew-graph-layout">
      <section class="uew-graph-pane" aria-labelledby="uew-tree-heading"><div class="uew-pane-title"><h3 id="uew-tree-heading">Hierarchy</h3><span id="uew-graph-tree-count">0 rendered</span></div><div id="uew-graph-tree" class="uew-tree" role="tree"></div><button id="uew-graph-tree-more" type="button" class="uew-secondary" hidden>Show 200 more hierarchy rows</button></section>
      <section class="uew-graph-pane" aria-labelledby="uew-table-heading"><div class="uew-pane-title"><h3 id="uew-table-heading">Flat entities</h3><span id="uew-graph-table-count">0 of 0</span></div><label class="uew-filter-label">Search<input id="uew-graph-filter" type="search" placeholder="ID, kind, name or source path"></label><div id="uew-graph-table-body" class="uew-graph-table" role="rowgroup"></div></section>
      <section class="uew-graph-pane" aria-labelledby="uew-details-heading"><div class="uew-pane-title"><h3 id="uew-details-heading">Selected entity</h3></div><pre id="uew-graph-details" class="uew-graph-details">Select an entity to inspect its source evidence.</pre></section>
    </div>`;
}

function sourceGraphMarkup() {
  return `<section class="uew-card uew-graph-card" aria-labelledby="uew-graph-heading">${graphSummaryMarkup()}${graphExplorerMarkup()}</section>`;
}

function masterImportMarkup() {
  return `
    <section class="uew-master-pane" aria-labelledby="uew-master-import-heading">
      <div class="uew-pane-title"><h3 id="uew-master-import-heading">Import master</h3><span id="uew-master-import-status">Not imported</span></div>
      <div class="uew-master-import-body">
        <div class="uew-controls"><label>Master file<input id="uew-master-file" type="file" accept=".csv,.tsv,.json,text/csv,text/tab-separated-values,application/json,text/plain"></label>
        <label>Format<select id="uew-master-format"><option value="csv">CSV</option><option value="tsv">TSV</option><option value="json">JSON</option></select></label></div>
        <label class="uew-editor-label">Role<select id="uew-master-role"><option value="line-list">Line list</option><option value="piping-class">Piping class</option><option value="material-map">Material map</option><option value="weight-master">Weight master</option><option value="custom" selected>Custom</option></select></label>
        <label class="uew-editor-label" for="uew-master-text">Paste or edit master text</label>
        <textarea id="uew-master-text" spellcheck="false" placeholder="Paste CSV, TSV or JSON row data"></textarea>
        <div class="uew-actions"><button id="uew-master-import" type="button">Import Master Dataset</button><button id="uew-master-registry-clear" type="button" class="uew-secondary" disabled>Clear Registry</button></div>
        <div class="uew-findings"><h3>Import errors</h3><ul id="uew-master-errors"><li>None</li></ul><h3>Import warnings</h3><ul id="uew-master-warnings"><li>None</li></ul></div>
      </div>
    </section>`;
}

function masterRegistryMarkup() {
  return `
    <section class="uew-master-pane" aria-labelledby="uew-master-list-heading">
      <div class="uew-pane-title"><h3 id="uew-master-list-heading">Registered datasets</h3></div>
      <div id="uew-master-dataset-list" class="uew-master-dataset-list">No datasets registered.</div>
      <div class="uew-actions uew-master-actions"><button id="uew-master-download" type="button" disabled>Download Dataset JSON</button><button id="uew-master-remove" type="button" class="uew-secondary" disabled>Remove Dataset</button><button id="uew-master-attach" type="button" disabled>Attach to Graph</button></div>
      <label class="uew-filter-label">Search rows<input id="uew-master-search" type="search" placeholder="Search visible dataset values"></label>
      <div class="uew-pane-title"><h3>Row preview</h3><span id="uew-master-preview-count">0 of 0</span></div>
      <div id="uew-master-preview-head" class="uew-master-preview-head"></div><div id="uew-master-preview-body" class="uew-master-preview-body"></div>
      <div class="uew-actions"><button id="uew-master-prev" type="button" class="uew-secondary" disabled>Previous 200</button><button id="uew-master-next" type="button" class="uew-secondary" disabled>Next 200</button></div>
    </section>`;
}

function masterDetailsMarkup() {
  return `
    <section class="uew-master-pane" aria-labelledby="uew-master-details-heading"><div class="uew-pane-title"><h3 id="uew-master-details-heading">Dataset details</h3></div><pre id="uew-master-details" class="uew-graph-details">Select a dataset to inspect.</pre>
      <div class="uew-pane-title"><h3>Graph attachments</h3><span id="uew-master-attachment-status">Not created</span></div><div id="uew-master-attachment-list" class="uew-master-attachment-list">Build a valid source graph to attach datasets.</div>
      <div class="uew-findings"><h3>Attachment errors</h3><ul id="uew-master-attachment-errors"><li>None</li></ul><h3>Attachment warnings</h3><ul id="uew-master-attachment-warnings"><li>None</li></ul></div>
      <div class="uew-actions"><button id="uew-master-attachment-download" type="button" disabled>Download Attachment Set JSON</button></div>
    </section>`;
}

function masterRegistrySectionMarkup() {
  return `<section class="uew-card uew-master-card" aria-labelledby="uew-master-heading"><div class="uew-graph-heading"><div><p class="uew-kicker">Reference data</p><h2 id="uew-master-heading">Master Registry</h2></div><span class="uew-schema">MasterDataset.v1 · MasterAttachmentSet.v1</span></div><div class="uew-master-layout">${masterImportMarkup()}${masterRegistryMarkup()}${masterDetailsMarkup()}</div></section>`;
}


function extractionRuleMarkup() {
  return `
    <section class="uew-extract-pane" aria-labelledby="uew-extract-rules-heading">
      <div class="uew-pane-title"><h3 id="uew-extract-rules-heading">Rules</h3><span id="uew-extract-rule-position">1 of 1</span></div>
      <div id="uew-extract-rule-list" class="uew-extract-list"></div>
      <div class="uew-actions uew-extract-actions"><button id="uew-extract-rule-add" type="button">Add</button><button id="uew-extract-rule-duplicate" type="button">Duplicate</button><button id="uew-extract-rule-remove" type="button" class="uew-secondary">Remove</button><button id="uew-extract-rule-up" type="button" class="uew-secondary">Move up</button><button id="uew-extract-rule-down" type="button" class="uew-secondary">Move down</button></div>
      <div class="uew-extract-form">
        <label>Field key<input id="uew-extract-field-key" type="text"></label><label class="uew-check"><input id="uew-extract-enabled" type="checkbox" checked>Enabled</label>
        <label>Entity kind<select id="uew-extract-entity-kind"><option value="">Any</option><option value="xml-element">XML element</option><option value="json-object">JSON object</option><option value="json-array">JSON array</option><option value="json-value">JSON value</option></select></label>
        <label>Exact name<input id="uew-extract-name-equals" type="text"></label><label>Path prefix<input id="uew-extract-path-prefix" type="text"></label>
        <label>Value source<select id="uew-extract-value-source"><option value="entity-name">Entity name</option><option value="entity-value">Entity value</option><option value="source-path">Source path</option><option value="attribute">Attribute</option></select></label>
        <label>Attribute name<input id="uew-extract-attribute-name" type="text"></label>
      </div>
    </section>`;
}

function extractionStrategyMarkup() {
  return `
    <section class="uew-extract-pane" aria-labelledby="uew-extract-strategies-heading">
      <div class="uew-pane-title"><h3 id="uew-extract-strategies-heading">Ordered strategies</h3></div>
      <div id="uew-extract-strategy-list" class="uew-extract-list"></div>
      <div class="uew-actions uew-extract-actions"><button id="uew-extract-strategy-add-regex" type="button">Add regex</button><button id="uew-extract-strategy-add-token" type="button">Add token</button><button id="uew-extract-strategy-remove" type="button" class="uew-secondary">Remove</button><button id="uew-extract-strategy-up" type="button" class="uew-secondary">Move up</button><button id="uew-extract-strategy-down" type="button" class="uew-secondary">Move down</button></div>
      <div class="uew-extract-form">
        <label>Kind<select id="uew-extract-strategy-kind"><option value="regex">Regex</option><option value="token">Token</option></select></label><label class="uew-check"><input id="uew-extract-strategy-trim" type="checkbox" checked>Trim</label>
        <label>Regex pattern<input id="uew-extract-regex-pattern" type="text"></label><label>Flags<input id="uew-extract-regex-flags" type="text" placeholder="imsu"></label><label>Capture group<input id="uew-extract-capture-group" type="text"></label>
        <label>Token mode<select id="uew-extract-token-mode"><option value="literal">Literal</option><option value="whitespace">Whitespace</option></select></label><label>Delimiter<input id="uew-extract-token-delimiter" type="text"></label><label>Token index<input id="uew-extract-token-index" type="number" min="0" step="1"></label>
      </div>
    </section>`;
}

function extractionConfigMarkup() {
  return `
    <section class="uew-extract-pane" aria-labelledby="uew-extract-config-heading">
      <div class="uew-pane-title"><h3 id="uew-extract-config-heading">Configuration</h3><span id="uew-extract-config-status">Not built</span></div>
      <dl class="uew-summary"><div><dt>Rules</dt><dd id="uew-extract-config-count">1</dd></div><div class="uew-wide"><dt>Config ID</dt><dd id="uew-extract-config-id">—</dd></div></dl>
      <div class="uew-actions"><button id="uew-extract-config-build" type="button">Build Extraction Config</button><button id="uew-extract-config-download" type="button" disabled>Download Config JSON</button></div>
      <div class="uew-findings"><h3>Config errors</h3><ul id="uew-extract-config-errors"><li>None</li></ul><h3>Config warnings</h3><ul id="uew-extract-config-warnings"><li>None</li></ul></div>
      <label class="uew-filter-label">Graph entity search<input id="uew-extract-entity-search" type="search" placeholder="ID, kind, name or path"></label><div class="uew-pane-title"><h3>Test entities</h3><span id="uew-extract-entity-count">0 shown</span></div><div id="uew-extract-entity-list" class="uew-extract-list"></div>
      <dl class="uew-summary"><div class="uew-wide"><dt>Selected entity</dt><dd id="uew-extract-selected-entity">None</dd></div></dl>
      <label class="uew-editor-label">Scope<select id="uew-extract-scope"><option value="selected">Selected</option><option value="filtered">Filtered</option><option value="all">All</option></select></label>
      <div class="uew-actions"><button id="uew-extract-run" type="button" disabled>Run Extraction Test</button><button id="uew-extract-run-download" type="button" disabled>Download Test Run JSON</button></div>
    </section>`;
}

function extractionResultsMarkup() {
  return `
    <section class="uew-extract-pane uew-extract-results" aria-labelledby="uew-extract-results-heading">
      <div class="uew-pane-title"><h3 id="uew-extract-results-heading">Test evidence</h3><span id="uew-extract-run-status">Not run</span></div>
      <dl class="uew-summary"><div class="uew-wide"><dt>Run ID</dt><dd id="uew-extract-run-id">—</dd></div><div class="uew-wide"><dt>Summary</dt><dd id="uew-extract-run-summary">—</dd></div></dl>
      <div class="uew-controls"><label>View<select id="uew-extract-result-view"><option value="matched">Matched</option><option value="rejected">Rejected</option><option value="diagnostics">Diagnostics</option></select></label><label>Search<input id="uew-extract-result-search" type="search"></label></div>
      <div class="uew-pane-title"><h3>Results</h3><span id="uew-extract-result-count">0 of 0</span></div><div id="uew-extract-result-list" class="uew-extract-list uew-extract-result-list"></div>
      <div class="uew-actions"><button id="uew-extract-result-prev" type="button" class="uew-secondary" disabled>Previous 200</button><button id="uew-extract-result-next" type="button" class="uew-secondary" disabled>Next 200</button></div>
      <pre id="uew-extract-result-details" class="uew-graph-details">Select a result to inspect strategy attempts.</pre>
    </section>`;
}

function extractionTesterSectionMarkup() {
  return `<section class="uew-card uew-extract-card" aria-labelledby="uew-extract-heading"><div class="uew-graph-heading"><div><p class="uew-kicker">Source-neutral parsing evidence</p><h2 id="uew-extract-heading">Extraction Tester</h2></div><span class="uew-schema">ExtractionConfig.v1 · ExtractionTestRun.v1</span></div><div class="uew-extract-layout">${extractionRuleMarkup()}${extractionStrategyMarkup()}${extractionConfigMarkup()}${extractionResultsMarkup()}</div></section>`;
}

export function renderWorkbenchMarkup() {
  return `
<section class="uew-shell" aria-labelledby="uew-title">
  <header class="uew-header">
    <div><p class="uew-kicker">Source intake, projection and reference registry</p><h1 id="uew-title">Universal Enrichment Workbench</h1></div>
    <span class="uew-schema">SourceEnvelope.v1 → UniversalSourceGraph.v1</span>
  </header>
  ${sourceIntakeMarkup()}
  ${sourceGraphMarkup()}
  ${masterRegistrySectionMarkup()}
  ${extractionTesterSectionMarkup()}
</section>`;
}
