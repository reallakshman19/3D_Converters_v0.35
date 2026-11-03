(function () {
  'use strict';
  const Core = globalThis.HpEngineeringLibraryCore;
  const Csv = globalThis.HpEngineeringLibraryCsv;
  const byId = (id) => document.getElementById(id);

  function status(message, kind = 'info') {
    const box = byId('libraryStatusBox');
    box.className = `notice ${kind}`;
    box.textContent = message;
  }

  function inputCell(row, className, value = '', type = 'text', readOnly = false) {
    const cell = row.insertCell();
    const input = document.createElement('input');
    input.className = `table-input ${className}`;
    input.type = type;
    if (type === 'number') input.step = 'any';
    input.value = value ?? '';
    input.readOnly = readOnly;
    cell.appendChild(input);
    return input;
  }

  function removeCell(row) {
    const cell = row.insertCell();
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'small-button remove-row';
    button.textContent = 'Remove';
    cell.appendChild(button);
  }

  function addMaterialRow(data = {}) {
    const row = byId('materialBody').insertRow();
    inputCell(row, 'm-spec wide', data.materialSpec);
    inputCell(row, 'm-grade', data.grade);
    inputCell(row, 'm-condition', data.condition);
    inputCell(row, 'm-temp', data.temperatureC, 'number');
    inputCell(row, 'm-s', data.allowableStressMpa, 'number');
    inputCell(row, 'm-syt', data.yieldStrengthMpa, 'number');
    inputCell(row, 'm-source wide', data.sourceRef);
    removeCell(row);
  }

  function addProductRow(data = {}) {
    const row = byId('productBody').insertRow();
    const selectCell = row.insertCell();
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'productSelection';
    radio.className = 'p-select';
    selectCell.appendChild(radio);
    inputCell(row, 'p-tag', data.tag);
    inputCell(row, 'p-schedule', data.schedule, 'text', Boolean(data.geometrySourceRef));
    inputCell(row, 'p-standard wide', data.dimensionStandard, 'text', Boolean(data.geometrySourceRef));
    inputCell(row, 'p-spec wide', data.productSpec);
    inputCell(row, 'p-refod', data.referenceOdMm, 'number', true);
    inputCell(row, 'p-d', data.designDiameterMm, 'number');
    inputCell(row, 'p-wall', data.nominalWallMm, 'number', Boolean(data.geometrySourceRef));
    inputCell(row, 'p-tol', data.minusTolerancePct, 'number');
    inputCell(row, 'p-geometry wide', data.geometrySourceRef, 'text', true);
    inputCell(row, 'p-source wide', data.sourceRef);
    removeCell(row);
  }

  function materialRows() {
    return [...byId('materialBody').rows].map((row) => ({
      materialSpec: row.querySelector('.m-spec').value.trim(),
      grade: row.querySelector('.m-grade').value.trim(),
      condition: row.querySelector('.m-condition').value.trim(),
      temperatureC: row.querySelector('.m-temp').value,
      allowableStressMpa: row.querySelector('.m-s').value,
      yieldStrengthMpa: row.querySelector('.m-syt').value,
      sourceRef: row.querySelector('.m-source').value.trim(),
    }));
  }

  function productRows() {
    return [...byId('productBody').rows].map((row) => ({
      tag: row.querySelector('.p-tag').value.trim(),
      schedule: row.querySelector('.p-schedule').value.trim(),
      dimensionStandard: row.querySelector('.p-standard').value.trim(),
      productSpec: row.querySelector('.p-spec').value.trim(),
      referenceOdMm: row.querySelector('.p-refod').value,
      designDiameterMm: row.querySelector('.p-d').value,
      nominalWallMm: row.querySelector('.p-wall').value,
      minusTolerancePct: row.querySelector('.p-tol').value,
      geometrySourceRef: row.querySelector('.p-geometry').value.trim(),
      sourceRef: row.querySelector('.p-source').value.trim(),
    }));
  }

  function metadata() {
    return {
      libraryId: byId('libraryId').value.trim(),
      revision: byId('libraryRevision').value.trim(),
      preparedBy: byId('libraryPreparedBy').value.trim(),
      materialSourceRef: byId('materialSourceRef').value.trim(),
      materialVersion: byId('materialVersion').value.trim(),
      productSourceRef: byId('productSourceRef').value.trim(),
      productVersion: byId('productVersion').value.trim(),
    };
  }

  function completedProducts(rows) {
    return rows.filter((row) => row.productSpec && row.designDiameterMm !== '' && row.minusTolerancePct !== '' && row.sourceRef);
  }

  function buildLibrary() {
    return Core.createLibrary({
      metadata: metadata(),
      materials: materialRows(),
      products: completedProducts(productRows()),
    });
  }

  function refreshMaterialSelection() {
    const select = byId('materialSelection');
    const prior = select.value;
    const groups = Core.materialGroups(materialRows());
    select.innerHTML = '<option value="">Select working-copy material</option>';
    groups.forEach((group) => {
      const option = document.createElement('option');
      option.value = group.key;
      option.textContent = group.label;
      select.appendChild(option);
    });
    if ([...select.options].some((option) => option.value === prior)) select.value = prior;
  }

  function previewMaterial() {
    try {
      const rows = materialRows();
      const key = byId('materialSelection').value;
      const designRaw = byId('materialDesignTemperature').value.trim();
      if (!designRaw) throw new Error('Preview temperature is required.');
      const result = Core.evaluateMaterial(rows, key, Number(designRaw));
      if (!result.ok) throw new Error(result.error);
      status(`Authoring preview only: S=${result.allowableStressMpa.toFixed(3)} MPa at ${designRaw}°C (${result.basis}). This value is NOT applied to the HP calculator; runtime masters come only from b313-ch9-master-store/v1.`);
    } catch (error) {
      status(`Material preview blocked: ${error.message}`, 'error');
    }
  }

  function previewProduct() {
    try {
      const rows = productRows();
      const selected = [...byId('productBody').rows].findIndex((row) => row.querySelector('.p-select')?.checked);
      const result = Core.productByIndex(rows, selected);
      if (!result.ok) throw new Error(result.error);
      const row = result.row;
      status(`Authoring preview only: NPS ${row.tag} ${row.schedule}, D=${row.designDiameterMm} mm, wall=${row.nominalWallMm} mm, minus tolerance=${row.minusTolerancePct}%. This row is NOT injected into the calculator; canonical runtime selection is through b313-ch9-master-store/v1.`);
    } catch (error) {
      status(`Product preview blocked: ${error.message}`, 'error');
    }
  }

  function downloadText(textValue, filename, type = 'text/csv;charset=utf-8') {
    const blob = new Blob([textValue], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  function downloadLibrary() {
    try {
      const lib = buildLibrary();
      const validation = Core.validateLibrary(lib);
      if (!validation.ok) throw new Error(validation.errors[0]);
      downloadText(`${JSON.stringify(lib, null, 2)}\n`, Core.safeFilename(lib.metadata.libraryId, lib.metadata.revision), 'application/json;charset=utf-8');
      status('Exported working-copy authoring JSON. It is ingestion evidence only and is not a runtime master store.');
    } catch (error) {
      status(`Library export blocked: ${error.message}`, 'error');
    }
  }

  function downloadMaterialCsv() {
    try {
      const errors = Core.validateMaterialRows(materialRows());
      if (errors.length) throw new Error(errors[0]);
      downloadText(Csv.materialCsv(materialRows()), 'material-properties.csv');
      status('Downloaded material-properties.csv as ingestion/authoring data. Canonical runtime publication requires controlled source reconciliation.');
    } catch (error) {
      status(`Material CSV export blocked: ${error.message}`, 'error');
    }
  }

  function downloadProductCsv() {
    try {
      const rows = productRows();
      const errors = Csv.validateProductOverlayRows(rows);
      if (errors.length) throw new Error(errors[0]);
      downloadText(Csv.productOverlayCsv(rows), 'pipe-product-overrides.csv');
      status('Downloaded pipe-product-overrides.csv as ingestion/authoring data; canonical geometry remains in the TSV dependency and runtime authority remains the master store.');
    } catch (error) {
      status(`Product CSV export blocked: ${error.message}`, 'error');
    }
  }

  async function importLibrary(file) {
    try {
      const lib = JSON.parse(await file.text());
      const validation = Core.validateLibrary(lib);
      if (!validation.ok) throw new Error(validation.errors[0]);
      const meta = lib.metadata;
      byId('libraryId').value = meta.libraryId;
      byId('libraryRevision').value = meta.revision;
      byId('libraryPreparedBy').value = meta.preparedBy;
      byId('materialSourceRef').value = meta.materialSourceRef;
      byId('materialVersion').value = meta.materialVersion;
      byId('productSourceRef').value = meta.productSourceRef;
      byId('productVersion').value = meta.productVersion;
      byId('materialBody').innerHTML = '';
      lib.materials.forEach(addMaterialRow);
      byId('productBody').innerHTML = '';
      lib.products.forEach(addProductRow);
      refreshMaterialSelection();
      status(`Imported authoring working copy ${meta.libraryId} rev ${meta.revision}. No runtime master records were changed.`);
    } catch (error) {
      status(`Library import blocked: ${error.message}`, 'error');
    }
  }

  async function fetchText(url) {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Fetch failed ${response.status}: ${url}`);
    return response.text();
  }

  async function reloadDocs() {
    status('Loading repository docs ingestion files…');
    try {
      const catalogUrl = new URL(Csv.CATALOG_PATH, window.location.href);
      const catalog = Csv.parseCatalog(await fetchText(catalogUrl));
      const material = catalog.find((row) => row.dataset === 'material');
      const product = catalog.find((row) => row.dataset === 'product_overlay');
      if (!material || !product || !product.dependencyPath) throw new Error('Required material/product catalog entries are missing.');
      const materialUrl = Csv.resolveUrl(catalogUrl, material.relativePath);
      const overlayUrl = Csv.resolveUrl(catalogUrl, product.relativePath);
      const masterUrl = Csv.resolveUrl(catalogUrl, product.dependencyPath);
      const [materialText, overlayText, masterText] = await Promise.all([
        fetchText(materialUrl), fetchText(overlayUrl), fetchText(masterUrl),
      ]);
      const materials = Csv.materialRowsFromCsv(materialText);
      const overlays = Csv.overlayRowsFromCsv(overlayText);
      const products = Csv.mergeProductOverlay(Csv.pipeRowsFromMaster(masterText, product.dependencyPath), overlays);
      byId('materialBody').innerHTML = '';
      materials.forEach(addMaterialRow);
      byId('productBody').innerHTML = '';
      products.forEach(addProductRow);
      byId('materialSourceRef').value = material.relativePath;
      byId('materialVersion').value = material.sourceVersion;
      byId('productSourceRef').value = product.dependencyPath;
      byId('productVersion').value = product.dependencyVersion;
      refreshMaterialSelection();
      status(`Loaded docs ingestion data: ${materials.length} material point(s), ${products.length} dimension rows, ${overlays.length} purchase overlay row(s). These rows are authoring evidence only; canonical runtime masters are published separately through b313-ch9-master-store/v1.`);
    } catch (error) {
      status(`Docs ingestion load blocked: ${error.message}`, 'error');
    }
  }

  document.addEventListener('click', (event) => {
    if (event.target.matches('.remove-row')) {
      event.target.closest('tr').remove();
      refreshMaterialSelection();
    }
  });
  byId('materialBody').addEventListener('input', refreshMaterialSelection);
  byId('addMaterialButton').addEventListener('click', () => addMaterialRow());
  byId('addProductButton').addEventListener('click', () => addProductRow());
  byId('applyMaterialButton').addEventListener('click', previewMaterial);
  byId('applyProductButton').addEventListener('click', previewProduct);
  byId('reloadDocsButton').addEventListener('click', reloadDocs);
  byId('exportMaterialCsvButton').addEventListener('click', downloadMaterialCsv);
  byId('exportProductCsvButton').addEventListener('click', downloadProductCsv);
  byId('exportLibraryButton').addEventListener('click', downloadLibrary);
  byId('importLibraryButton').addEventListener('click', () => byId('libraryFile').click());
  byId('libraryFile').addEventListener('change', async () => {
    if (byId('libraryFile').files?.[0]) await importLibrary(byId('libraryFile').files[0]);
    byId('libraryFile').value = '';
  });
  reloadDocs();
})();
