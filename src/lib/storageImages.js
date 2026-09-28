import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { deleteObject, getDownloadURL, listAll, ref, uploadBytes } from 'firebase/storage';
import { db, storage } from './firebase';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_PDF_BYTES = 15 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const logoAssetCache = new Map();

function validateImage(file) {
  if (!file) throw new Error('Selecione uma imagem.');
  if (!ALLOWED_TYPES.has(file.type)) throw new Error('Use PNG, JPG ou WEBP.');
  if (file.size > MAX_IMAGE_BYTES) throw new Error('A imagem deve ter no máximo 5 MB.');
}

function validatePdf(file) {
  if (!file) throw new Error('Selecione um arquivo PDF.');
  if (file.type !== 'application/pdf' && !file.name?.toLowerCase().endsWith('.pdf')) {
    throw new Error('O arquivo vetorial deve estar em PDF.');
  }
  if (file.size > MAX_PDF_BYTES) throw new Error('O PDF deve ter no máximo 15 MB.');
}

function safeName(name) {
  return String(name || 'arquivo').replace(/[^a-zA-Z0-9._-]/g, '_');
}

function extensionFor(file, kind) {
  if (kind === 'pdf') return 'pdf';
  if (file.type === 'image/jpeg') return 'jpg';
  if (file.type === 'image/webp') return 'webp';
  return 'png';
}

async function sha256Blob(blob) {
  const buffer = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function optimizeFinalRender(blob) {
  if (!blob || typeof createImageBitmap !== 'function') return { blob, contentType: 'image/png', ext: 'png' };
  try {
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    context.drawImage(bitmap, 0, 0);
    bitmap.close?.();
    const webp = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.9));
    if (webp && webp.size > 0 && webp.size < blob.size) {
      return { blob: webp, contentType: 'image/webp', ext: 'webp' };
    }
  } catch {
    // Mantém o PNG original quando o navegador não suportar a otimização.
  }
  return { blob, contentType: 'image/png', ext: 'png' };
}

async function deleteStorageFolder(folderRef) {
  const listing = await listAll(folderRef);
  await Promise.all(listing.items.map((itemRef) => deleteObject(itemRef)));
  for (const childFolder of listing.prefixes) {
    await deleteStorageFolder(childFolder);
  }
}

export async function resolveLogoAsset(file, uid, kind = 'image') {
  if (kind === 'pdf') validatePdf(file);
  else validateImage(file);

  const hash = await sha256Blob(file);
  if (logoAssetCache.has(hash)) return logoAssetCache.get(hash);

  const assetDoc = doc(db, 'logoAssets', hash);
  const existing = await getDoc(assetDoc);
  if (existing.exists() && existing.data()?.url) {
    const asset = { hash, ...existing.data(), reused: true };
    logoAssetCache.set(hash, asset);
    return asset;
  }

  const ext = extensionFor(file, kind);
  const fileName = kind === 'pdf' ? 'original.pdf' : `asset.${ext}`;
  const objectRef = ref(storage, `logo-assets/${hash}/${fileName}`);
  await uploadBytes(objectRef, file, { contentType: kind === 'pdf' ? 'application/pdf' : file.type });
  const url = await getDownloadURL(objectRef);

  const asset = {
    hash,
    url,
    kind,
    contentType: kind === 'pdf' ? 'application/pdf' : file.type,
    originalName: safeName(file.name),
    size: file.size,
    createdBy: uid,
    reused: false,
  };

  await setDoc(assetDoc, { ...asset, createdAt: serverTimestamp() }, { merge: true });
  logoAssetCache.set(hash, asset);
  return asset;
}

export async function uploadGarmentImage(file, garmentId, view) {
  validateImage(file);
  const objectRef = ref(storage, `garments/${garmentId}/${view}-${Date.now()}-${safeName(file.name)}`);
  await uploadBytes(objectRef, file, { contentType: file.type });
  return getDownloadURL(objectRef);
}

export async function deleteGarmentStorageFiles(garmentId) {
  if (!garmentId) throw new Error('Peça inválida.');
  await deleteStorageFolder(ref(storage, `garments/${garmentId}`));
}

export async function uploadClientLogo(file, uid) {
  return (await resolveLogoAsset(file, uid, 'image')).url;
}

export async function uploadClientLogoOriginalPdf(file, uid) {
  return (await resolveLogoAsset(file, uid, 'pdf')).url;
}

export async function uploadFinalRender(blob, uid, label = 'final') {
  if (!blob || blob.size > 10 * 1024 * 1024) throw new Error('Render final inválido.');
  const optimized = await optimizeFinalRender(blob);
  const objectRef = ref(storage, `final-renders/${uid}/${Date.now()}-${safeName(label)}.${optimized.ext}`);
  await uploadBytes(objectRef, optimized.blob, {
    contentType: optimized.contentType,
    customMetadata: {
      retention: '90-days',
      originalBytes: String(blob.size),
      optimizedBytes: String(optimized.blob.size),
    },
  });
  return getDownloadURL(objectRef);
}
