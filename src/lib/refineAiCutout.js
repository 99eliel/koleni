function clamp(value, min = 0, max = 255) {
  return Math.max(min, Math.min(max, value));
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Não foi possível gerar o PNG refinado.'));
    }, 'image/png');
  });
}

async function loadImageSource(blob) {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(blob);
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      release: () => bitmap.close?.(),
    };
  }

  const url = URL.createObjectURL(blob);
  const image = new Image();
  image.decoding = 'async';
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = () => reject(new Error('Não foi possível decodificar a imagem para refinamento.'));
    image.src = url;
  });

  return {
    source: image,
    width: image.naturalWidth,
    height: image.naturalHeight,
    release: () => URL.revokeObjectURL(url),
  };
}

function estimateBackgroundColor(originalData, alphaData, width, height) {
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  const maxSamples = 6000;
  const total = width * height;
  const stride = Math.max(1, Math.floor(total / maxSamples));

  for (let pixel = 0; pixel < total; pixel += stride) {
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    const nearBorder = x < width * 0.12 || x > width * 0.88 || y < height * 0.12 || y > height * 0.88;
    if (!nearBorder) continue;
    const offset = pixel * 4;
    if (alphaData[offset + 3] > 22) continue;
    r += originalData[offset];
    g += originalData[offset + 1];
    b += originalData[offset + 2];
    count += 1;
  }

  if (count < 12) return { r: 255, g: 255, b: 255 };
  return { r: r / count, g: g / count, b: b / count };
}

function smoothAlpha(alpha, width, height, amount) {
  if (amount <= 0) return alpha;
  const mix = Math.min(0.42, (amount / 100) * 0.42);
  const output = new Float32Array(alpha.length);

  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      const index = row + x;
      const center = alpha[index];
      let sum = center * 2;
      let weight = 2;
      if (x > 0) { sum += alpha[index - 1]; weight += 1; }
      if (x + 1 < width) { sum += alpha[index + 1]; weight += 1; }
      if (y > 0) { sum += alpha[index - width]; weight += 1; }
      if (y + 1 < height) { sum += alpha[index + width]; weight += 1; }
      const average = sum / weight;
      output[index] = center + ((average - center) * mix);
    }
  }

  return output;
}

export const AI_REFINEMENT_PRESETS = {
  maximum: {
    label: 'Máxima qualidade',
    detail: 90,
    cleanup: 4,
    smoothing: 10,
    decontaminate: 52,
  },
  delicate: {
    label: 'Logo delicada',
    detail: 98,
    cleanup: 2,
    smoothing: 5,
    decontaminate: 34,
  },
  balanced: {
    label: 'Equilibrado',
    detail: 82,
    cleanup: 7,
    smoothing: 13,
    decontaminate: 48,
  },
  simple: {
    label: 'Logo simples',
    detail: 72,
    cleanup: 13,
    smoothing: 16,
    decontaminate: 66,
  },
  complex: {
    label: 'Arte complexa',
    detail: 86,
    cleanup: 5,
    smoothing: 20,
    decontaminate: 42,
  },
};

export async function refineAiCutout(resultBlob, originalBlob, options = {}) {
  const detail = clamp(Number(options.detail) || 0, 0, 100);
  const cleanup = clamp(Number(options.cleanup) || 0, 0, 40);
  const smoothing = clamp(Number(options.smoothing) || 0, 0, 100);
  const decontaminate = clamp(Number(options.decontaminate) || 0, 0, 100);

  const [resultImage, originalImage] = await Promise.all([
    loadImageSource(resultBlob),
    loadImageSource(originalBlob),
  ]);

  try {
    const width = resultImage.width;
    const height = resultImage.height;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Seu navegador não permitiu refinar o PNG da IA.');

    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(resultImage.source, 0, 0, width, height);
    const resultPixels = ctx.getImageData(0, 0, width, height);

    const originalCanvas = document.createElement('canvas');
    originalCanvas.width = width;
    originalCanvas.height = height;
    const originalCtx = originalCanvas.getContext('2d', { willReadFrequently: true });
    if (!originalCtx) throw new Error('Seu navegador não permitiu analisar a imagem original.');
    originalCtx.drawImage(originalImage.source, 0, 0, width, height);
    const originalPixels = originalCtx.getImageData(0, 0, width, height);

    const pixelCount = width * height;
    const alpha = new Float32Array(pixelCount);
    // Detail controls the alpha curve: higher values recover weak, fine strokes.
    const gamma = 1 - ((detail / 100) * 0.46);

    for (let pixel = 0; pixel < pixelCount; pixel += 1) {
      const offset = pixel * 4;
      const normalized = resultPixels.data[offset + 3] / 255;
      alpha[pixel] = normalized <= 0 ? 0 : Math.pow(normalized, gamma) * 255;
    }

    const refinedAlpha = smoothAlpha(alpha, width, height, smoothing);
    const background = estimateBackgroundColor(originalPixels.data, resultPixels.data, width, height);
    const decontaminateStrength = decontaminate / 100;

    for (let pixel = 0; pixel < pixelCount; pixel += 1) {
      const offset = pixel * 4;
      let nextAlpha = refinedAlpha[pixel];
      if (nextAlpha <= cleanup) nextAlpha = 0;
      else if (cleanup > 0 && nextAlpha < cleanup * 3) {
        const range = Math.max(1, cleanup * 2);
        nextAlpha *= (nextAlpha - cleanup) / range;
      }
      nextAlpha = clamp(nextAlpha);
      resultPixels.data[offset + 3] = Math.round(nextAlpha);

      if (nextAlpha <= 0 || decontaminateStrength <= 0) continue;
      const a = nextAlpha / 255;
      if (a >= 0.995) continue;

      // Recover edge colors mixed with the estimated background, reducing pale halos.
      const safeAlpha = Math.max(0.12, a);
      const edgeFactor = 1 - Math.abs((a * 2) - 1);
      const strength = decontaminateStrength * Math.max(0, edgeFactor);
      if (strength <= 0.002) continue;

      const sourceR = originalPixels.data[offset];
      const sourceG = originalPixels.data[offset + 1];
      const sourceB = originalPixels.data[offset + 2];
      const recoveredR = clamp((sourceR - (background.r * (1 - safeAlpha))) / safeAlpha);
      const recoveredG = clamp((sourceG - (background.g * (1 - safeAlpha))) / safeAlpha);
      const recoveredB = clamp((sourceB - (background.b * (1 - safeAlpha))) / safeAlpha);

      resultPixels.data[offset] = Math.round(sourceR + ((recoveredR - sourceR) * strength));
      resultPixels.data[offset + 1] = Math.round(sourceG + ((recoveredG - sourceG) * strength));
      resultPixels.data[offset + 2] = Math.round(sourceB + ((recoveredB - sourceB) * strength));
    }

    ctx.putImageData(resultPixels, 0, 0);
    return await canvasToBlob(canvas);
  } finally {
    resultImage.release();
    originalImage.release();
  }
}
