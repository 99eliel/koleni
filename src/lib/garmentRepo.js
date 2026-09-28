import { collection, deleteDoc, doc, getDoc, getDocs, orderBy, query, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from './firebase';

const GARMENT_LIST_CACHE_MS = 5 * 60 * 1000;
let listCache = { at: 0, items: null };
const garmentCache = new Map();

function serializeRegions(regions = []) {
  return regions.map((region) => ({
    ...region,
    polygons: (region.polygons ?? []).map((polygon) => ({
      points: Array.isArray(polygon) ? polygon : (polygon?.points ?? []),
    })),
  }));
}

function deserializeRegions(regions = []) {
  return regions.map((region) => ({
    ...region,
    polygons: (region.polygons ?? []).map((polygon) => (
      Array.isArray(polygon) ? polygon : (Array.isArray(polygon?.points) ? polygon.points : [])
    )),
  }));
}

function normalizeGarment(id, data) {
  return {
    id,
    ...data,
    archived: Boolean(data?.archived),
    regions: deserializeRegions(data?.regions ?? []),
  };
}

function cacheItems(items) {
  listCache = { at: Date.now(), items };
  items.forEach((item) => garmentCache.set(item.id, item));
  return items;
}

function invalidateGarmentCache(id = '') {
  listCache = { at: 0, items: null };
  if (id) garmentCache.delete(id);
  else garmentCache.clear();
}

export async function getGarment(id, { force = false, includeArchived = false } = {}) {
  if (!force && garmentCache.has(id)) {
    const cached = garmentCache.get(id);
    return !includeArchived && cached.archived ? null : cached;
  }

  if (!force && listCache.items && Date.now() - listCache.at < GARMENT_LIST_CACHE_MS) {
    const cached = listCache.items.find((item) => item.id === id);
    if (cached) return !includeArchived && cached.archived ? null : cached;
  }

  const snapshot = await getDoc(doc(db, 'garments', id));
  if (!snapshot.exists()) return null;
  const item = normalizeGarment(snapshot.id, snapshot.data());
  garmentCache.set(id, item);
  return !includeArchived && item.archived ? null : item;
}

export async function listGarments({ force = false, includeArchived = false } = {}) {
  let items;
  if (!force && listCache.items && Date.now() - listCache.at < GARMENT_LIST_CACHE_MS) {
    items = listCache.items;
  } else {
    const snapshot = await getDocs(query(collection(db, 'garments'), orderBy('name')));
    items = cacheItems(snapshot.docs.map((item) => normalizeGarment(item.id, item.data())));
  }

  return includeArchived ? items : items.filter((item) => !item.archived);
}

export async function saveGarment(id, data) {
  await setDoc(doc(db, 'garments', id), {
    ...data,
    archived: false,
    regions: serializeRegions(data.regions ?? []),
    updatedAt: serverTimestamp(),
  }, { merge: true });
  invalidateGarmentCache(id);
}

export async function setGarmentArchived(id, archived) {
  if (!id) throw new Error('Peça inválida.');
  await setDoc(doc(db, 'garments', id), {
    archived: Boolean(archived),
    archivedAt: archived ? serverTimestamp() : null,
    updatedAt: serverTimestamp(),
  }, { merge: true });
  invalidateGarmentCache(id);
}

export async function deleteGarmentPermanently(id) {
  if (!id) throw new Error('Peça inválida.');
  const garmentRef = doc(db, 'garments', id);
  const snapshot = await getDoc(garmentRef);
  if (!snapshot.exists()) {
    invalidateGarmentCache(id);
    return;
  }
  if (!snapshot.data()?.archived) {
    throw new Error('Arquive a peça antes de excluí-la permanentemente.');
  }
  await deleteDoc(garmentRef);
  invalidateGarmentCache(id);
}

export function createGarmentId(name) {
  const slug = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'peca';
  return `${slug}-${Date.now().toString(36)}`;
}
