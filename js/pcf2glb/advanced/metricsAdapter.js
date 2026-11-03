export function buildMetricIndex(metricSets = []) {
  const byMetric = new Map();

  for (const metric of metricSets) {
    const itemMap = new Map();
    for (const row of metric.data || []) {
      if (!row?.id) continue;
      itemMap.set(String(row.id), row.value);
    }
    byMetric.set(metric.key, {
      key: metric.key,
      label: metric.label || metric.key,
      unit: metric.unit || '',
      values: itemMap,
    });
  }

  return byMetric;
}

export function getMergedProperties(sceneItem, metricIndex) {
  const id = sceneItem?.id;
  const metrics = [];

  for (const metric of metricIndex.values()) {
    metrics.push({
      key: metric.key,
      label: metric.label,
      unit: metric.unit,
      value: metric.values.get(id) ?? null,
    });
  }

  return {
    id: sceneItem.id,
    type: sceneItem.type,
    refNo: sceneItem.refNo,
    bore: sceneItem.bore,
    rawMeta: sceneItem.rawMeta,
    metrics,
  };
}
