function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    if (typeof source === 'string' && !source.startsWith('data:') && !source.startsWith('blob:')) {
      image.crossOrigin = 'anonymous';
    }
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Não foi possível abrir esta logo para tratamento.'));
    image.src = source;
  });
}

function dominantBorderColor(imageData) {
  const { data, width, height } = imageData;
  const bins = new Map();
  const step = Math.max(1, Math.floor(Math.max(width, height) / 500));

  function add(x, y) {
    const i = ((y * width) + x) * 4;
    if (data[i + 3] < 32) return;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const key = `${r >> 5}-${g >> 5}-${b >> 5}`;
    const entry = bins.get(key) || { count: 0, r: 0, g: 0, b: 0 };
    entry.count += 1;
    entry.r += r;
    entry.g += g;
    entry.b += b;
    bins.set(key, entry);
  }

  for (let x = 0; x < width; x += step) {
    add(x, 0);
    if (height > 1) add(x, height - 1);
  }
  for (let y = step; y < height - 1; y += step) {
    add(0, y);
    if (width > 1) add(width - 1, y);
  }

  let winner = null;
  for (const entry of bins.values()) {
    if (!winner || entry.count > winner.count) winner = entry;
  }

  if (!winner || winner.count === 0) return { r: 255, g: 255, b: 255 };
  return {
    r: Math.round(winner.r / winner.count),
    g: Math.round(winner.g / winner.count),
    b: Math.round(winner.b / winner.count),
  };
}

function colorDistance(data, offset, color) {
  const dr = data[offset] - color.r;
  const dg = data[offset + 1] - color.g;
  const db = data[offset + 2] - color.b;
  return Math.sqrt((dr * dr) + (dg * dg) + (db * db));
}

export async function prepareBackgroundRemoval(source, maxDimension = 1600) {
  const image = await loadImage(source);
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  if (!sourceWidth || !sourceHeight) throw new Error('A logo selecionada não possui dimensões válidas.');

  const ratio = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * ratio));
  const height = Math.max(1, Math.round(sourceHeight * ratio));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, width, height);
  const imageData = ctx.getImageData(0, 0, width, height);

  return {
    width,
    height,
    imageData,
    autoColor: dominantBorderColor(imageData),
  };
}

export function samplePreparedColor(prepared, xRatio, yRatio) {
  const x = Math.max(0, Math.min(prepared.width - 1, Math.floor(xRatio * prepared.width)));
  const y = Math.max(0, Math.min(prepared.height - 1, Math.floor(yRatio * prepared.height)));
  const i = ((y * prepared.width) + x) * 4;
  const { data } = prepared.imageData;
  return { r: data[i], g: data[i + 1], b: data[i + 2] };
}

export function colorToCss(color) {
  if (!color) return '#ffffff';
  return `rgb(${color.r}, ${color.g}, ${color.b})`;
}

function applyTransparentAlpha(pixels, source, index, distance, tolerance, feather) {
  const offset = index * 4;
  if (source[offset + 3] === 0) {
    pixels[offset + 3] = 0;
    return;
  }
  if (distance <= tolerance) {
    pixels[offset + 3] = 0;
    return;
  }
  if (feather > 0 && distance <= tolerance + feather) {
    const factor = (distance - tolerance) / feather;
    pixels[offset + 3] = Math.round(source[offset + 3] * Math.max(0, Math.min(1, factor)));
  }
}

export async function processBackgroundRemoval(prepared, options = {}) {
  const tolerance = Math.max(1, Number(options.tolerance) || 42);
  const feather = Math.max(0, Number(options.feather) || 0);
  const removeInternalIslands = options.removeInternalIslands !== false;
  const backgroundColor = options.backgroundColor || prepared.autoColor;
  const { width, height } = prepared;
  const source = prepared.imageData.data;
  const pixels = new Uint8ClampedArray(source);
  const total = width * height;
  const threshold = tolerance + feather;
  const candidate = new Uint8Array(total);
  const visited = new Uint8Array(total);
  const queue = new Int32Array(total);

  for (let index = 0; index < total; index += 1) {
    const offset = index * 4;
    if (source[offset + 3] === 0 || colorDistance(source, offset, backgroundColor) <= threshold) {
      candidate[index] = 1;
    }
  }

  // Componentes pequenos totalmente fechados costumam ser resíduos do fundo
  // presos dentro de letras/símbolos. O limite baixo preserva áreas maiores
  // que provavelmente fazem parte da própria marca.
  const maxInternalIslandPixels = Math.max(48, Math.round(total * 0.006));

  for (let seed = 0; seed < total; seed += 1) {
    if (!candidate[seed] || visited[seed]) continue;

    let head = 0;
    let tail = 0;
    let touchesBorder = false;
    queue[tail++] = seed;
    visited[seed] = 1;

    while (head < tail) {
      const index = queue[head++];
      const x = index % width;
      const y = Math.floor(index / width);

      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
        touchesBorder = true;
      }

      const left = x > 0 ? index - 1 : -1;
      const right = x < width - 1 ? index + 1 : -1;
      const up = y > 0 ? index - width : -1;
      const down = y < height - 1 ? index + width : -1;

      if (left >= 0 && candidate[left] && !visited[left]) {
        visited[left] = 1;
        queue[tail++] = left;
      }
      if (right >= 0 && candidate[right] && !visited[right]) {
        visited[right] = 1;
        queue[tail++] = right;
      }
      if (up >= 0 && candidate[up] && !visited[up]) {
        visited[up] = 1;
        queue[tail++] = up;
      }
      if (down >= 0 && candidate[down] && !visited[down]) {
        visited[down] = 1;
        queue[tail++] = down;
      }
    }

    const removeComponent = touchesBorder || (removeInternalIslands && tail <= maxInternalIslandPixels);
    if (!removeComponent) continue;

    for (let i = 0; i < tail; i += 1) {
      const index = queue[i];
      const distance = colorDistance(source, index * 4, backgroundColor);
      applyTransparentAlpha(pixels, source, index, distance, tolerance, feather);
    }
  }

  const output = document.createElement('canvas');
  output.width = width;
  output.height = height;
  const ctx = output.getContext('2d');
  ctx.putImageData(new ImageData(pixels, width, height), 0, 0);

  return new Promise((resolve, reject) => {
    output.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Não foi possível gerar a logo sem fundo.'));
    }, 'image/png');
  });
}

export function backgroundRemovedFile(blob, originalName = 'logo') {
  const base = String(originalName)
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_') || 'logo';
  return new File([blob], `${base}-sem-fundo.png`, { type: 'image/png' });
}
