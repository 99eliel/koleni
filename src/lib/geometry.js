export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function pointInPolygon(point, polygon) {
  if (!polygon || polygon.length < 3) return false;

  let inside = false;
  const { x, y } = point;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;

    const intersects = ((yi > y) !== (yj > y))
      && (x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi);

    if (intersects) inside = !inside;
  }

  return inside;
}

export function getRegionAtPoint(regions, point, view) {
  return [...regions]
    .filter((region) => region.view === view)
    .sort((a, b) => (b.zIndex ?? 0) - (a.zIndex ?? 0))
    .find((region) => region.polygons?.some((polygon) => pointInPolygon(point, polygon))) ?? null;
}

export function normalizedPointFromEvent(event, canvas) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: clamp((event.clientX - rect.left) / rect.width, 0, 1),
    y: clamp((event.clientY - rect.top) / rect.height, 0, 1),
  };
}

export function distancePixels(a, b, width, height) {
  const dx = (a.x - b.x) * width;
  const dy = (a.y - b.y) * height;
  return Math.hypot(dx, dy);
}

export function pointToSegmentDistancePixels(point, a, b, width, height) {
  const px = point.x * width;
  const py = point.y * height;
  const ax = a.x * width;
  const ay = a.y * height;
  const bx = b.x * width;
  const by = b.y * height;
  const abx = bx - ax;
  const aby = by - ay;
  const lengthSq = abx * abx + aby * aby;

  if (!lengthSq) return Math.hypot(px - ax, py - ay);

  const t = clamp(((px - ax) * abx + (py - ay) * aby) / lengthSq, 0, 1);
  const cx = ax + t * abx;
  const cy = ay + t * aby;
  return Math.hypot(px - cx, py - cy);
}

export function slugifyRegionId(label, existingIds = []) {
  const base = label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'regiao';

  let candidate = base;
  let counter = 2;
  while (existingIds.includes(candidate)) {
    candidate = `${base}-${counter}`;
    counter += 1;
  }
  return candidate;
}
