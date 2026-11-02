function clamp(value, min = 0, max = 255) {
  return Math.max(min, Math.min(max, value));
}

function hexToRgb(value) {
  const hex = String(value || '').trim().replace('#', '');
  if (!/^[0-9a-f]{3}([0-9a-f]{3})?$/i.test(hex)) {
    return { r: 0, g: 0, b: 0 };
  }
  const normalized = hex.length === 3
    ? hex.split('').map((char) => `${char}${char}`).join('')
    : hex;
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Não foi possível carregar a logo para trocar a cor.'));
    image.src = source;
  });
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Não foi possível gerar a logo recolorida.'));
    }, 'image/png');
  });
}

function luminance(r, g, b) {
  return ((0.2126 * r) + (0.7152 * g) + (0.0722 * b)) / 255;
}

export async function recolorLogoSource(source, {
  color = '#111827',
  mode = 'flat',
} = {}) {
  const image = await loadImage(source);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (!width || !height) throw new Error('A logo não possui dimensões válidas.');

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Seu navegador não permitiu editar a cor da logo.');

  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const target = hexToRgb(color);

  let minLum = 1;
  let maxLum = 0;
  if (mode === 'shading') {
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 16) continue;
      const lum = luminance(data[i], data[i + 1], data[i + 2]);
      minLum = Math.min(minLum, lum);
      maxLum = Math.max(maxLum, lum);
    }
  }

  const spread = Math.max(0, maxLum - minLum);

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;

    let factor = 1;
    if (mode === 'shading' && spread > 0.08) {
      const lum = luminance(data[i], data[i + 1], data[i + 2]);
      const normalized = Math.max(0, Math.min(1, (lum - minLum) / spread));
      factor = 0.58 + (normalized * 0.42);
    }

    data[i] = clamp(Math.round(target.r * factor));
    data[i + 1] = clamp(Math.round(target.g * factor));
    data[i + 2] = clamp(Math.round(target.b * factor));
  }

  ctx.putImageData(imageData, 0, 0);
  const blob = await canvasToBlob(canvas);
  return {
    blob,
    url: URL.createObjectURL(blob),
  };
}
