function freezeRegistry(registry) {
  return Object.freeze({ schema: 'MasterRegistry.v1', datasets: Object.freeze([...registry.datasets]) });
}

export function createMasterRegistry(datasets = []) {
  return freezeRegistry({ datasets: [...datasets] });
}

export function addMasterDataset(registry, dataset) {
  const existing = registry.datasets.find((item) => item.datasetId === dataset.datasetId);
  if (existing) return { registry, dataset: existing, added: false, duplicate: true };
  const next = createMasterRegistry([...registry.datasets, dataset]);
  return { registry: next, dataset, added: true, duplicate: false };
}

export function removeMasterDataset(registry, datasetId) {
  const removed = registry.datasets.find((item) => item.datasetId === datasetId) || null;
  if (!removed) return { registry, removed: null };
  return { registry: createMasterRegistry(registry.datasets.filter((item) => item.datasetId !== datasetId)), removed };
}

export function findMasterDataset(registry, datasetId) {
  return registry.datasets.find((item) => item.datasetId === datasetId) || null;
}
