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

function createBlurredMask(width, height, polygons, blurPx = 1.5) {
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

  return {
    r: median(reds),
    g: median(greens),
    b: median(blues),
  };
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
      const confidence = smoothStep(
        (distance - fullyBackgroundDistance) / (fullyGarmentDistance - fullyBackgroundDistance),
      );

      maskData.data[index] = 255;
      maskData.data[index + 1] = 255;
      maskData.data[index + 2] = 255;
      maskData.data[index + 3] = Math.round(originalAlpha * confidence);
    }

    const subjectMask = document.createElement('canvas');
    subjectMask.width = width;
    subjectMask.height = height;
    const subjectCtx = subjectMask.getContext('2d');
    subjectCtx.putImageData(maskData, 0, 0);

    cacheBySize.set(cacheKey, subjectMask);
    return subjectMask;
  } catch {
    cacheBySize.set(cacheKey, null);
    return null;
  }
}

function createRegionMask(width, height, polygons, image, useSubjectMask = false) {
  const polygonMask = createBlurredMask(width, height, polygons, 1.5);

  // As regiões já são desenhadas manualmente sobre a peça e, portanto, são a
  // fonte de verdade da máscara. Não tentamos remover o fundo por cor por padrão:
  // esse tipo de inferência confundia tecido branco com fundo branco e deixava a
  // máscara semitransparente, fazendo branco virar cinza. O recorte automático
  // permanece disponível apenas para regiões que optarem explicitamente por ele.
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

function createMaskedSolidLayer(width, height, mask, color) {
  const layer = document.createElement('canvas');
  layer.width = width;
  layer.height = height;
  const layerCtx = layer.getContext('2d');
  layerCtx.fillStyle = color;
  layerCtx.fillRect(0, 0, width, height);
  layerCtx.globalCompositeOperation = 'destination-in';
  layerCtx.drawImage(mask, 0, 0);
  layerCtx.globalCompositeOperation = 'source-over';
  return layer;
}

function createMaskedDetailLayer(width, height, mask, image, contrast = 1.12) {
  const layer = document.createElement('canvas');
  layer.width = width;
  layer.height = height;
  const layerCtx = layer.getContext('2d');

  // Somente luz, sombra e textura retornam para a região. A matiz original da
  // fotografia é descartada para não contaminar a cor escolhida pelo vendedor.
  layerCtx.filter = `grayscale(1) contrast(${contrast})`;
  layerCtx.drawImage(image, 0, 0, width, height);
  layerCtx.filter = 'none';
  layerCtx.globalCompositeOperation = 'destination-in';
  layerCtx.drawImage(mask, 0, 0);
  layerCtx.globalCompositeOperation = 'source-over';
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

function inferColorMode(region) {
  // O modo normal do sistema agora é substituição cromática real. O modo tint
  // fica disponível apenas para regiões antigas/especiais que o solicitem de
  // forma explícita. Isso impede que a cor original da foto ofusque a nova cor.
  return region?.colorMode === 'tint' ? 'tint' : 'replace';
}

function recolorRegionTint(ctx, image, region, chosenColor, width, height) {
  const mask = createRegionMask(
    width,
    height,
    region.polygons ?? [],
    image,
    region?.useSubjectMask === true,
  );
  const brightness = colorBrightness(chosenColor);
  const liftAlpha = Math.min(0.82, 0.08 + brightness * 0.78);
  const whiteLayer = createMaskedSolidLayer(width, height, mask, '#ffffff');

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = liftAlpha;
  ctx.drawImage(whiteLayer, 0, 0);
  ctx.restore();

  const colorLayer = createMaskedSolidLayer(width, height, mask, chosenColor);
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = 1;
  ctx.drawImage(colorLayer, 0, 0);
  ctx.restore();

  const detailLayer = createMaskedDetailLayer(width, height, mask, image);
  ctx.save();
  ctx.globalCompositeOperation = 'soft-light';
  ctx.globalAlpha = 0.34;
  ctx.drawImage(detailLayer, 0, 0);
  ctx.restore();
}

function recolorRegionReplace(ctx, image, region, chosenColor, width, height) {
  const mask = createRegionMask(
    width,
    height,
    region.polygons ?? [],
    image,
    region?.useSubjectMask === true,
  );
  const brightness = colorBrightness(chosenColor);

  // A cor escolhida substitui totalmente a cromaticidade original. Não existe
  // multiply com a foto original; portanto branco, amarelo claro e tons pastéis
  // chegam ao valor correto em vez de herdarem cinza/azul da peça fotografada.
  const colorLayer = createMaskedSolidLayer(width, height, mask, chosenColor);
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.drawImage(colorLayer, 0, 0);
  ctx.restore();

  // Reaplicamos apenas textura e volume. Em cores muito claras a intensidade é
  // propositalmente menor: branco deve continuar visualmente branco, com sombra
  // suficiente apenas para não parecer uma área chapada.
  const detailContrast = 1.06 + ((1 - brightness) * 0.18);
  const detailAlpha = 0.12 + ((1 - brightness) * 0.34);
  const detailLayer = createMaskedDetailLayer(width, height, mask, image, detailContrast);
  ctx.save();
  ctx.globalCompositeOperation = 'soft-light';
  ctx.globalAlpha = detailAlpha;
  ctx.drawImage(detailLayer, 0, 0);
  ctx.restore();
}

function recolorRegion(ctx, image, region, chosenColor, width, height) {
  if (inferColorMode(region) === 'tint') {
    recolorRegionTint(ctx, image, region, chosenColor, width, height);
    return;
  }

  recolorRegionReplace(ctx, image, region, chosenColor, width, height);
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
        ctx.fillStyle = region.id === highlightRegionId
          ? 'rgba(37, 99, 235, 0.18)'
          : 'rgba(17, 24, 39, 0.06)';
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
