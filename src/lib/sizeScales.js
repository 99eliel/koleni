export const SIZE_SCALE_PRESETS = {
  letters: {
    label: 'Letras (PP ao EXGG)',
    labels: ['PP', 'P', 'M', 'G', 'GG', 'XGG', 'EXGG'],
  },
  numericAdult: {
    label: 'Numeração adulta (34 ao 60)',
    labels: ['34', '36', '38', '40', '42', '44', '46', '48', '50', '52', '54', '56', '58', '60'],
  },
  numericChild: {
    label: 'Numeração infantil (2 ao 16)',
    labels: ['2', '4', '6', '8', '10', '12', '14', '16'],
  },
  custom: {
    label: 'Personalizada',
    labels: [],
  },
};

export const DEFAULT_SIZE_SCALE_TYPE = 'letters';

function uniqueLabels(values = []) {
  const seen = new Set();
  const labels = [];

  values.forEach((value) => {
    const label = String(value ?? '').trim();
    if (!label || seen.has(label)) return;
    seen.add(label);
    labels.push(label);
  });

  return labels.slice(0, 30);
}

export function parseCustomSizeLabels(value) {
  if (Array.isArray(value)) return uniqueLabels(value);
  return uniqueLabels(String(value ?? '').split(/[,;\n]+/));
}

export function normalizeSizeScale(scale) {
  const requestedType = typeof scale === 'string' ? scale : scale?.type;
  const type = SIZE_SCALE_PRESETS[requestedType] ? requestedType : DEFAULT_SIZE_SCALE_TYPE;

  if (type === 'custom') {
    return {
      type,
      labels: parseCustomSizeLabels(scale?.labels ?? []),
    };
  }

  return {
    type,
    labels: [...SIZE_SCALE_PRESETS[type].labels],
  };
}

export function getSizeScaleLabels(scale) {
  const normalized = normalizeSizeScale(scale);
  return normalized.labels.length
    ? normalized.labels
    : [...SIZE_SCALE_PRESETS[DEFAULT_SIZE_SCALE_TYPE].labels];
}

export function getSizeScaleLabel(scale) {
  const normalized = normalizeSizeScale(scale);
  if (normalized.type === 'custom') {
    return normalized.labels.length
      ? `Personalizada (${normalized.labels.join(', ')})`
      : 'Personalizada';
  }
  return SIZE_SCALE_PRESETS[normalized.type].label;
}

export function createEmptySizeGrid(labels, source = {}) {
  return Object.fromEntries(
    labels.map((label) => [label, Math.max(0, Number(source?.[label]) || 0)]),
  );
}
