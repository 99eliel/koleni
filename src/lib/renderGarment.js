const subjectMaskCache = new WeakMap();

function drawPolygon(ctx, polygon, width, height) {
  if (!polygon?.length) return;
  ctx.beginPath();
  polygon.forEach((point, index) => {
    const x = point.x * width;
    const y = point.y * height;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
}

function createBlurredMask(width, height, polygons, blurPx = 1.2) {
  const hardMask = document.createElement('canvas');
  hardMask.width = width;
  hardMask.height = height;
  const hardCtx = hardMask.getContext('2d');
  hardCtx.fillStyle = '#fff';
  polygons.forEach((polygon) => {
    drawPolygon(hardCtx, polygon, width, height);
    hardCtx.fill();
  });
  if (!blurPx) return hardMask;
  const softMask = document.createElement('canvas');
  softMask.width = width;
  softMask.height = height;
  const softCtx = softMask.getContext('2d');
  softCtx.filter = `blur(${blurPx}px)`;
  softCtx.drawImage(hardMask, 0, 0);
  softCtx.filter = 'none';
  return softMask;
}

function median(values) {
  if (!values.length) return 0;
  values.sort((a, b) => a - b);
  return values[Math.floor(values.length / 2)];
}

function estimateBackgroundColor(data, width, height) {
  const reds = [];
  const greens = [];
  const blues = [];
  const step = Math.max(1, Math.floor(Math.min(width, height) / 80));
  const borderDepth = Math.max(2, Math.floor(Math.min(width, height) * 0.025));
  function sample(x, y) {
    const index = (y * width + x) * 4;
    if (data[index + 3] < 200) return;
    reds.push(data[index]);
    greens.push(data[index + 1]);
    blues.push(data[index + 2]);
  }
  for (let y = 0; y < borderDepth; y += step) {
    for (let x = 0; x < width; x += step) {
      sample(x, y);
      sample(x, height - 1 - y);
    }
  }
  for (let x = 0; x < borderDepth; x += step) {
    for (let y = borderDepth; y < height - borderDepth; y += step) {
      sample(x, y);
      sample(width - 1 - x, y);
    }
  }
  return { r: median(reds), g: median(greens), b: median(blues) };
}

function smoothStep(value) {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

function buildSubjectMask(image, width, height) {
  let cacheBySize = subjectMaskCache.get(image);
  if (!cacheBySize) {
    cacheBySize = new Map();
    subjectMaskCache.set(image, cacheBySize);
  }
  const cacheKey = `${width}x${height}`;
  if (cacheBySize.has(cacheKey)) return cacheBySize.get(cacheKey);
  try {
    const source = document.createElement('canvas');
    source.width = width;
    source.height = height;
    const sourceCtx = source.getContext('2d', { willReadFrequently: true });
    sourceCtx.drawImage(image, 0, 0, width, height);
    const imageData = sourceCtx.getImageData(0, 0, width, height);
    const { data } = imageData;
    const background = estimateBackgroundColor(data, width, height);
    const maskData = new ImageData(width, height);
    const fullyBackgroundDistance = 14;
    const fullyGarmentDistance = 48;
    for (let index = 0; index < data.length; index += 4) {
      const originalAlpha = data[index + 3];
      if (originalAlpha === 0) continue;
      const dr = data[index] - background.r;
      const dg = data[index + 1] - background.g;
      const db = data[index + 2] - background.b;
      const distance = Math.sqrt(dr * dr + dg * dg + db * db);
      const confidence = smoothStep((distance - fullyBackgroundDistance) / (fullyGarmentDistance - fullyBackgroundDistance));
      maskData.data[index] = 255;
      maskData.data[index + 1] = 255;
      maskData.data[index + 2] = 255;
      maskData.data[index + 3] = Math.round(originalAlpha * confidence);
    }
    const subjectMask = document.createElement('canvas');
    subjectMask.width = width;
    subjectMask.height = height;
    subjectMask.getContext('2d').putImageData(maskData, 0, 0);
    cacheBySize.set(cacheKey, subjectMask);
    return subjectMask;
  } catch {
    cacheBySize.set(cacheKey, null);
    return null;
  }
}

function createRegionMask(width, height, polygons, image, useSubjectMask = false) {
  const polygonMask = createBlurredMask(width, height, polygons, 1.2);
  if (!useSubjectMask) return polygonMask;
  const subjectMask = buildSubjectMask(image, width, height);
  if (!subjectMask) return polygonMask;
  const mask = document.createElement('canvas');
  mask.width = width;
  mask.height = height;
  const maskCtx = mask.getContext('2d');
  maskCtx.drawImage(polygonMask, 0, 0);
  maskCtx.globalCompositeOperation = 'destination-in';
  maskCtx.drawImage(subjectMask, 0, 0);
  maskCtx.globalCompositeOperation = 'source-over';
  return mask;
}

function maskedSolid(width, height, mask, color) {
  const layer = document.createElement('canvas');
  layer.width = width;
  layer.height = height;
  const ctx = layer.getContext('2d');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(mask, 0, 0);
  return layer;
}

function maskedGray(width, height, mask, image, contrast = 1.08, brightness = 1) {
  const layer = document.createElement('canvas');
  layer.width = width;
  layer.height = height;
  const ctx = layer.getContext('2d');
  ctx.filter = `grayscale(1) contrast(${contrast}) brightness(${brightness})`;
  ctx.drawImage(image, 0, 0, width, height);
  ctx.filter = 'none';
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(mask, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  return layer;
}

function colorBrightness(color) {
  const value = String(color ?? '').trim();
  const short = /^#([0-9a-f]{3})$/i.exec(value);
  const full = /^#([0-9a-f]{6})$/i.exec(value);
  let hex;
  if (short) hex = short[1].split('').map((char) => char + char).join('');
  else if (full) hex = full[1];
  else return 0.5;
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function normalizeColorChoice(choice) {
  if (typeof choice === 'string') {
    return {
      color: choice,
      opacity: 100,
      saturation: 100,
      brightness: 100,
    };
  }
  if (!choice || typeof choice !== 'object') return null;
  const color = typeof choice.color === 'string' ? choice.color : '';
  if (!color) return null;
  return {
    color,
    opacity: clampNumber(choice.opacity, 0, 100, 100),
    saturation: clampNumber(choice.saturation, 0, 160, 100),
    brightness: clampNumber(choice.brightness, 50, 140, 100),
  };
}

function profileFor(region, brightness) {
  const named = region?.materialProfile || 'balanced';
  const profiles = {
    soft: { detail: 0.18, shadow: 0.12, highlight: 0.08, contrast: 1.04 },
    balanced: { detail: 0.26, shadow: 0.2, highlight: 0.12, contrast: 1.09 },
    technical: { detail: 0.34, shadow: 0.28, highlight: 0.17, contrast: 1.16 },
    flat: { detail: 0.1, shadow: 0.06, highlight: 0.04, contrast: 1.02 },
  };
  const base = profiles[named] || profiles.balanced;
  const lightFactor = brightness > 0.82 ? 0.58 : brightness < 0.18 ? 1.18 : 1;
  return {
    detail: base.detail * lightFactor,
    shadow: base.shadow * lightFactor,
    highlight: base.highlight * (brightness > 0.75 ? 0.5 : 1),
    contrast: base.contrast,
  };
}

function recolorRegion(ctx, image, region, chosenChoice, width, height) {
  const settings = normalizeColorChoice(chosenChoice);
  if (!settings) return;

  const mask = createRegionMask(width, height, region.polygons ?? [], image, region?.useSubjectMask === true);
  const brightness = colorBrightness(settings.color);
  const profile = profileFor(region, brightness);

  const colorLayer = maskedSolid(width, height, mask, settings.color);
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = settings.opacity / 100;
  ctx.filter = `saturate(${settings.saturation}%) brightness(${settings.brightness}%)`;
  ctx.drawImage(colorLayer, 0, 0);
  ctx.filter = 'none';
  ctx.restore();

  const textureFactor = 0.65 + ((100 - settings.opacity) / 100) * 0.35;
  const detailLayer = maskedGray(width, height, mask, image, profile.contrast, 1.02);
  ctx.save();
  ctx.globalCompositeOperation = 'soft-light';
  ctx.globalAlpha = Math.min(0.5, profile.detail * textureFactor);
  ctx.drawImage(detailLayer, 0, 0);
  ctx.restore();

  const shadowLayer = maskedGray(width, height, mask, image, 1.28, 0.72);
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = Math.min(0.45, profile.shadow * textureFactor);
  ctx.drawImage(shadowLayer, 0, 0);
  ctx.restore();

  if (profile.highlight > 0) {
    const highlightLayer = maskedGray(width, height, mask, image, 1.18, 1.2);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = Math.min(0.3, profile.highlight * textureFactor);
    ctx.drawImage(highlightLayer, 0, 0);
    ctx.restore();
  }
}

export function renderGarment({
  canvas,
  image,
  regions,
  view,
  colorChoices = {},
  visibleRegionIds = null,
  highlightRegionId = null,
  showEditorOverlay = false,
}) {
  if (!canvas || !image) return;
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.filter = 'none';
  ctx.drawImage(image, 0, 0, width, height);

  const activeRegions = regions
    .filter((region) => region.view === view)
    .filter((region) => !visibleRegionIds || visibleRegionIds.has(region.id))
    .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));

  activeRegions.forEach((region) => {
    const chosenColor = colorChoices[region.id];
    if (!chosenColor) return;
    recolorRegion(ctx, image, region, chosenColor, width, height);
  });

  if (showEditorOverlay) {
    activeRegions.forEach((region) => {
      region.polygons?.forEach((polygon) => {
        drawPolygon(ctx, polygon, width, height);
        ctx.save();
        ctx.fillStyle = region.id === highlightRegionId ? 'rgba(37, 99, 235, 0.18)' : 'rgba(17, 24, 39, 0.06)';
        ctx.strokeStyle = region.id === highlightRegionId ? '#2563eb' : 'rgba(17, 24, 39, 0.45)';
        ctx.lineWidth = region.id === highlightRegionId ? 2.5 : 1.25;
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      });
    });
  }
}

export function drawEditableVertices({ canvas, region, currentPolygon = [], hoverPoint = null, selectedVertex = null }) {
  if (!canvas || !region) return;
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;
  region.polygons?.forEach((polygon, polygonIndex) => {
    polygon.forEach((point, vertexIndex) => {
      const x = point.x * width;
      const y = point.y * height;
      ctx.beginPath();
      ctx.arc(x, y, selectedVertex?.polygonIndex === polygonIndex && selectedVertex?.vertexIndex === vertexIndex ? 7 : 5, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#2563eb';
      ctx.stroke();
    });
  });
  if (currentPolygon.length) {
    ctx.save();
    ctx.strokeStyle = '#dc2626';
    ctx.fillStyle = '#dc2626';
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 5]);
    ctx.beginPath();
    currentPolygon.forEach((point, index) => {
      const x = point.x * width;
      const y = point.y * height;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    if (hoverPoint) ctx.lineTo(hoverPoint.x * width, hoverPoint.y * height);
    ctx.stroke();
    ctx.setLineDash([]);
    currentPolygon.forEach((point) => {
      ctx.beginPath();
      ctx.arc(point.x * width, point.y * height, 5, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }
}
