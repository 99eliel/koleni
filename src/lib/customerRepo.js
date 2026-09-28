import { doc, getDoc, increment, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from './firebase';

function normalizeWhatsapp(value) {
  return String(value ?? '').replace(/\D/g, '');
}

async function sha256Text(value) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function customerIdFromWhatsapp(whatsapp) {
  const normalized = normalizeWhatsapp(whatsapp);
  if (normalized.length < 10) throw new Error('Informe um WhatsApp válido para localizar o cliente.');
  return sha256Text(normalized);
}

function compactLogo(logo) {
  return {
    storageUrl: logo.storageUrl || '',
    sourceUrl: logo.sourceUrl || logo.storageUrl || '',
    originalUrl: logo.originalUrl || logo.sourceUrl || logo.storageUrl || '',
    processedUrl: logo.processedUrl || '',
    sourceName: logo.sourceName || '',
    sourceType: logo.sourceType || 'image',
    sourcePage: logo.sourcePage || 1,
    sourcePageCount: logo.sourcePageCount || 1,
    backgroundRemoved: Boolean(logo.backgroundRemoved),
    placementLabel: logo.placementLabel || '',
    widthCm: Number(logo.widthCm) || null,
    position: logo.position || null,
  };
}

export async function getCustomerByWhatsapp(whatsapp) {
  const id = await customerIdFromWhatsapp(whatsapp);
  const snapshot = await getDoc(doc(db, 'customers', id));
  return snapshot.exists() ? { id, ...snapshot.data() } : null;
}

export async function saveCustomerOrderSnapshot({
  customerName,
  whatsapp,
  sellerEmail,
  garmentId,
  garmentName,
  colorChoices,
  logos,
  sizeGrid,
  quantity,
}) {
  const normalizedWhatsapp = normalizeWhatsapp(whatsapp);
  const id = await customerIdFromWhatsapp(normalizedWhatsapp);
  const uniqueLogos = Array.from(
    new Map((logos ?? []).map((logo) => [logo.originalUrl || logo.sourceUrl || logo.storageUrl, compactLogo(logo)])).values(),
  );

  await setDoc(doc(db, 'customers', id), {
    name: customerName,
    whatsapp: normalizedWhatsapp,
    lastSellerEmail: sellerEmail || '',
    orderCount: increment(1),
    lastOrderAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastOrderTemplate: {
      garmentId,
      garmentName,
      colorChoices: colorChoices ?? {},
      logos: uniqueLogos,
      sizeGrid: sizeGrid ?? {},
      quantity: quantity ?? null,
    },
  }, { merge: true });

  return id;
}

export { normalizeWhatsapp };
