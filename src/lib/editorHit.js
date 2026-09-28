import { distancePixels, pointToSegmentDistancePixels } from './geometry';

export function findVertexHit(region, point, width, height, tolerance = 10) {
  if (!region) return null;
  for (let polygonIndex = 0; polygonIndex < region.polygons.length; polygonIndex += 1) {
    const polygon = region.polygons[polygonIndex];
    for (let vertexIndex = 0; vertexIndex < polygon.length; vertexIndex += 1) {
      if (distancePixels(point, polygon[vertexIndex], width, height) <= tolerance) {
        return { polygonIndex, vertexIndex };
      }
    }
  }
  return null;
}

export function findEdgeHit(region, point, width, height, tolerance = 7) {
  if (!region) return null;
  for (let polygonIndex = 0; polygonIndex < region.polygons.length; polygonIndex += 1) {
    const polygon = region.polygons[polygonIndex];
    for (let edgeIndex = 0; edgeIndex < polygon.length; edgeIndex += 1) {
      const a = polygon[edgeIndex];
      const b = polygon[(edgeIndex + 1) % polygon.length];
      if (pointToSegmentDistancePixels(point, a, b, width, height) <= tolerance) {
        return { polygonIndex, edgeIndex };
      }
    }
  }
  return null;
}

export function moveVertex(regions, regionId, selection, point) {
  return regions.map((region) => {
    if (region.id !== regionId) return region;
    const polygons = region.polygons.map((polygon, polygonIndex) => (
      polygonIndex === selection.polygonIndex
        ? polygon.map((vertex, vertexIndex) => (vertexIndex === selection.vertexIndex ? point : vertex))
        : polygon
    ));
    return { ...region, polygons };
  });
}

export function insertVertex(regions, regionId, hit, point) {
  return regions.map((region) => {
    if (region.id !== regionId) return region;
    const polygons = region.polygons.map((polygon, polygonIndex) => (
      polygonIndex === hit.polygonIndex
        ? [...polygon.slice(0, hit.edgeIndex + 1), point, ...polygon.slice(hit.edgeIndex + 1)]
        : polygon
    ));
    return { ...region, polygons };
  });
}

export function removeVertex(regions, regionId, selection) {
  return regions.map((region) => {
    if (region.id !== regionId) return region;

    const polygons = region.polygons.flatMap((polygon, polygonIndex) => {
      if (polygonIndex !== selection.polygonIndex) return [polygon];
      if (polygon.length <= 3) return [];
      return [polygon.filter((_, vertexIndex) => vertexIndex !== selection.vertexIndex)];
    });

    return { ...region, polygons };
  });
}
