function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function distanceRgb(data, offset, color) {
  const dr = data[offset] - color.r;
  const dg = data[offset + 1] - color.g;
  const db = data[offset + 2] - color.b;
  return Math.sqrt((dr * dr) + (dg * dg) + (db * db));
}

function quantizedKey(r, g, b, size = 24) {
  return `${Math.floor(r / size)}:${Math.floor(g / size)}:${Math.floor(b / size)}`;
}

export function analyzePreparedBackground(prepared) {
  if (!prepared?.imageData?.data || !prepared.width || !prepared.height) {
    return {
      recommended: 'ai',
      confidence: 0,
      backgroundColor: prepared?.autoColor || { r: 255, g: 255, b: 255 },
      suggestedTolerance: 42,
      suggestedFeather: 10,
      reason: 'Não foi possível analisar a distribuição de cores.',
    };
  }

  const { width, height } = prepared;
  const data = prepared.imageData.data;
  const totalPixels = width * height;
  const maxSamples = 22000;
  const stride = Math.max(1, Math.floor(totalPixels / maxSamples));
  const bins = new Map();
  let opaqueSamples = 0;
  let transparentSamples = 0;

  for (let pixel = 0; pixel < totalPixels; pixel += stride) {
    const offset = pixel * 4;
    const alpha = data[offset + 3];
    if (alpha < 32) {
      transparentSamples += 1;
      continue;
    }

    opaqueSamples += 1;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    const key = quantizedKey(r, g, b);
    const entry = bins.get(key) || { count: 0, r: 0, g: 0, b: 0 };
    entry.count += 1;
    entry.r += r;
    entry.g += g;
    entry.b += b;
    bins.set(key, entry);
  }

  let winner = null;
  for (const entry of bins.values()) {
    if (!winner || entry.count > winner.count) winner = entry;
  }

  if (!winner || opaqueSamples === 0) {
    return {
      recommended: 'ai',
      confidence: 0,
      backgroundColor: prepared.autoColor || { r: 255, g: 255, b: 255 },
      suggestedTolerance: 42,
      suggestedFeather: 10,
      reason: 'A imagem já parece ser majoritariamente transparente.',
    };
  }

  const backgroundColor = {
    r: Math.round(winner.r / winner.count),
    g: Math.round(winner.g / winner.count),
    b: Math.round(winner.b / winner.count),
  };

  const sampledTotal = opaqueSamples + transparentSamples;
  const opaqueRatio = sampledTotal ? opaqueSamples / sampledTotal : 1;
  const dominanceOpaque = winner.count / opaqueSamples;
  const dominanceTotal = winner.count / Math.max(1, sampledTotal);

  const bandX = Math.max(1, Math.round(width * 0.08));
  const bandY = Math.max(1, Math.round(height * 0.08));
  const borderStride = Math.max(1, Math.floor(Math.max(width, height) / 500));
  let borderOpaque = 0;
  let borderMatches = 0;
  const matchDistance = 48;

  for (let y = 0; y < height; y += borderStride) {
    for (let x = 0; x < width; x += borderStride) {
      const onBorder = x < bandX || x >= width - bandX || y < bandY || y >= height - bandY;
      if (!onBorder) continue;
      const offset = ((y * width) + x) * 4;
      if (data[offset + 3] < 32) continue;
      borderOpaque += 1;
      if (distanceRgb(data, offset, backgroundColor) <= matchDistance) borderMatches += 1;
    }
  }

  const borderMatch = borderOpaque ? borderMatches / borderOpaque : 0;

  let varianceSum = 0;
  let varianceCount = 0;
  for (let pixel = 0; pixel < totalPixels; pixel += stride) {
    const offset = pixel * 4;
    if (data[offset + 3] < 32) continue;
    const d = distanceRgb(data, offset, backgroundColor);
    if (d <= 72) {
      varianceSum += d;
      varianceCount += 1;
    }
  }
  const averageSpread = varianceCount ? varianceSum / varianceCount : 36;

  const looksSolid =
    dominanceTotal >= 0.20
    || (opaqueRatio >= 0.72 && dominanceOpaque >= 0.38)
    || (borderMatch >= 0.76 && dominanceTotal >= 0.12);

  const confidenceBase = Math.max(
    dominanceTotal * 2.2,
    (dominanceOpaque * 0.72) + (borderMatch * 0.28),
  );
  const confidence = Math.round(clamp(confidenceBase * 100, 0, 99));

  const suggestedTolerance = Math.round(clamp(26 + (averageSpread * 0.85), 26, 58));
  const suggestedFeather = Math.round(clamp(7 + (averageSpread * 0.18), 7, 16));

  let reason;
  if (looksSolid) {
    if (dominanceTotal >= 0.42) {
      reason = 'Uma única cor ocupa grande parte da imagem.';
    } else if (borderMatch >= 0.76) {
      reason = 'A mesma cor se repete de forma consistente ao redor da arte.';
    } else {
      reason = 'Foi detectada uma área grande e uniforme atrás da logo.';
    }
  } else {
    reason = 'A imagem possui várias cores/tons e não apresenta um fundo chapado confiável.';
  }

  return {
    recommended: looksSolid ? 'solid' : 'ai',
    confidence,
    backgroundColor,
    suggestedTolerance,
    suggestedFeather,
    dominanceOpaque,
    dominanceTotal,
    borderMatch,
    opaqueRatio,
    reason,
  };
}
