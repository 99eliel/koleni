export const DEFAULT_MEASUREMENT_GUIDE = {
  title: 'Tabela de medidas',
  columns: [],
  rows: [],
  imageUrl: '',
};

function cleanText(value, max = 40) {
  return String(value ?? '').trim().slice(0, max);
}

function uniqueColumns(columns = []) {
  const seen = new Set();
  const result = [];
  columns.forEach((item) => {
    const label = cleanText(item, 18);
    if (!label || seen.has(label)) return;
    seen.add(label);
    result.push(label);
  });
  return result.slice(0, 24);
}

export function columnsFromSizeLabels(sizeLabels = []) {
  return uniqueColumns(['TOL', ...(sizeLabels || [])]);
}

export function normalizeMeasurementGuide(value, fallbackSizeLabels = []) {
  const source = value && typeof value === 'object' ? value : {};
  const columns = uniqueColumns(
    Array.isArray(source.columns) && source.columns.length
      ? source.columns
      : columnsFromSizeLabels(fallbackSizeLabels),
  );

  const rows = (Array.isArray(source.rows) ? source.rows : [])
    .slice(0, 30)
    .map((row, index) => {
      const values = {};
      columns.forEach((column) => {
        values[column] = cleanText(row?.values?.[column], 24);
      });
      return {
        id: cleanText(row?.id, 80) || `medida-${index + 1}`,
        label: cleanText(row?.label, 40),
        values,
      };
    });

  return {
    title: cleanText(source.title, 80) || 'Tabela de medidas',
    columns,
    rows,
    imageUrl: String(source.imageUrl || '').trim(),
  };
}

export function hasMeasurementGuide(value) {
  const guide = normalizeMeasurementGuide(value, []);
  return Boolean(guide.imageUrl || guide.rows.some((row) => row.label || Object.values(row.values).some(Boolean)));
}
