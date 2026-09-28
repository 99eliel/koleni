import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';

const ORDER_CACHE_MS = 10 * 1000;
const SELLER_ORDER_CACHE_MS = 30 * 1000;
const DEFAULT_ORDER_LIMIT = 80;
const DEFAULT_SELLER_ORDER_LIMIT = 30;
let orderCache = { at: 0, maxItems: 0, items: null };
const sellerOrderCache = new Map();

function invalidateOrderCache() {
  orderCache = { at: 0, maxItems: 0, items: null };
}

function invalidateSellerOrderCache(uid = '') {
  if (uid) sellerOrderCache.delete(uid);
  else sellerOrderCache.clear();
}

function lightweightDesignSnapshot(data) {
  return {
    garmentId: data.garmentId,
    garmentName: data.garmentName,
    colorChoices: data.colorChoices ?? {},
    logos: data.logos ?? [],
    sizeScale: data.sizeScale ?? null,
    sizeGrid: data.sizeGrid ?? {},
    quantity: data.quantity ?? null,
    notes: data.notes ?? '',
  };
}

function approvalToken() {
  const random = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${random.replace(/[^a-zA-Z0-9-]/g, '')}-${Math.random().toString(36).slice(2, 12)}`;
}

function orderDisplayCode(sequence) {
  return `MP-${String(sequence).padStart(6, '0')}`;
}

function sellerSummary(data, orderId, displayCode, token, expireAt, now) {
  return {
    orderId,
    displayCode,
    sellerUid: data.sellerUid || '',
    sellerEmail: data.sellerEmail || '',
    customerName: data.customerName || '',
    whatsapp: data.whatsapp || '',
    garmentId: data.garmentId || '',
    garmentName: data.garmentName || data.garmentId || '',
    quantity: Number(data.quantity) || 0,
    sizeScale: data.sizeScale ?? null,
    sizeGrid: data.sizeGrid ?? {},
    status: 'pending',
    approvalStatus: 'pending',
    approvalToken: token,
    designVersion: 1,
    finalImageUrl: data.finalImageUrl || '',
    expireAt,
    createdAt: Timestamp.fromDate(now),
    updatedAt: Timestamp.fromDate(now),
  };
}

export async function createOrder(data) {
  if (!data?.sellerUid) throw new Error('Vendedor não identificado. Entre novamente no sistema.');

  const now = new Date();
  const expireAt = Timestamp.fromDate(new Date(now.getTime() + (90 * 24 * 60 * 60 * 1000)));
  const snapshot = lightweightDesignSnapshot(data);
  const token = approvalToken();
  const orderRef = doc(collection(db, 'orders'));
  const previewRef = doc(db, 'approvalPreviews', token);
  const counterRef = doc(db, 'system', 'orderCounter');
  const sellerOrderRef = doc(db, 'sellerOrders', data.sellerUid, 'orders', orderRef.id);
  let displayCode = '';

  await runTransaction(db, async (transaction) => {
    const counterSnapshot = await transaction.get(counterRef);
    const currentSequence = counterSnapshot.exists()
      ? Math.max(1, Number(counterSnapshot.data()?.next) || 1)
      : 1;
    displayCode = orderDisplayCode(currentSequence);

    transaction.set(counterRef, {
      next: currentSequence + 1,
      updatedAt: serverTimestamp(),
    }, { merge: true });

    transaction.set(orderRef, {
      ...data,
      displayCode,
      sequenceNumber: currentSequence,
      status: 'pending',
      approvalStatus: 'pending',
      approvalToken: token,
      designVersion: 1,
      designHistory: [{
        version: 1,
        savedAt: now.toISOString(),
        ...snapshot,
      }],
      productionChecklist: {
        garmentChecked: false,
        colorsChecked: false,
        logosChecked: false,
        sizesChecked: false,
        finalChecked: false,
      },
      expireAt,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    transaction.set(previewRef, {
      orderId: orderRef.id,
      displayCode,
      customerName: data.customerName || '',
      garmentName: data.garmentName || data.garmentId || '',
      quantity: Number(data.quantity) || 0,
      designVersion: 1,
      finalImageUrl: data.finalImageUrl || '',
      sellerUid: data.sellerUid || '',
      status: 'pending',
      expireAt,
      createdAt: serverTimestamp(),
    });

    transaction.set(
      sellerOrderRef,
      sellerSummary(data, orderRef.id, displayCode, token, expireAt, now),
    );
  });

  invalidateOrderCache();
  invalidateSellerOrderCache(data.sellerUid);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('martinpel:order-created', {
      detail: { id: orderRef.id, displayCode, approvalToken: token },
    }));
  }

  return orderRef.id;
}

export async function listOrders({ force = false, maxItems = DEFAULT_ORDER_LIMIT } = {}) {
  if (
    !force
    && orderCache.items
    && orderCache.maxItems >= maxItems
    && Date.now() - orderCache.at < ORDER_CACHE_MS
  ) {
    return orderCache.items.slice(0, maxItems);
  }

  const snapshot = await getDocs(query(
    collection(db, 'orders'),
    orderBy('createdAt', 'desc'),
    limit(maxItems),
  ));
  const items = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
  orderCache = { at: Date.now(), maxItems, items };
  return items;
}

export async function listSellerOrders(uid, { force = false, maxItems = DEFAULT_SELLER_ORDER_LIMIT } = {}) {
  if (!uid) return [];
  const cached = sellerOrderCache.get(uid);
  if (
    !force
    && cached?.items
    && cached.maxItems >= maxItems
    && Date.now() - cached.at < SELLER_ORDER_CACHE_MS
  ) {
    return cached.items.slice(0, maxItems);
  }

  const snapshot = await getDocs(query(
    collection(db, 'sellerOrders', uid, 'orders'),
    orderBy('createdAt', 'desc'),
    limit(maxItems),
  ));
  const items = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
  sellerOrderCache.set(uid, { at: Date.now(), maxItems, items });
  return items;
}

async function resolveSellerUid(orderId, sellerUid = '') {
  if (sellerUid) return sellerUid;
  const snapshot = await getDoc(doc(db, 'orders', orderId));
  return snapshot.exists() ? (snapshot.data()?.sellerUid || '') : '';
}

export async function setOrderStatus(orderId, status, sellerUid = '') {
  const allowed = new Set(['pending', 'quoted', 'approval', 'approved', 'production', 'quality', 'ready', 'completed']);
  if (!allowed.has(status)) throw new Error('Status de pedido inválido.');

  const resolvedSellerUid = await resolveSellerUid(orderId, sellerUid);
  const batch = writeBatch(db);
  batch.update(doc(db, 'orders', orderId), {
    status,
    completedAt: status === 'completed' ? serverTimestamp() : null,
    updatedAt: serverTimestamp(),
  });

  if (resolvedSellerUid) {
    batch.set(doc(db, 'sellerOrders', resolvedSellerUid, 'orders', orderId), {
      status,
      completedAt: status === 'completed' ? serverTimestamp() : null,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  }

  await batch.commit();
  invalidateOrderCache();
  invalidateSellerOrderCache(resolvedSellerUid);
}

export async function setOrderCompleted(orderId, completed, sellerUid = '') {
  return setOrderStatus(orderId, completed ? 'completed' : 'pending', sellerUid);
}

export async function saveProductionChecklist(orderId, checklist) {
  await updateDoc(doc(db, 'orders', orderId), {
    productionChecklist: {
      garmentChecked: Boolean(checklist.garmentChecked),
      colorsChecked: Boolean(checklist.colorsChecked),
      logosChecked: Boolean(checklist.logosChecked),
      sizesChecked: Boolean(checklist.sizesChecked),
      finalChecked: Boolean(checklist.finalChecked),
    },
    updatedAt: serverTimestamp(),
  });
  invalidateOrderCache();
}

export async function saveOrderQuote(orderId, quote) {
  await updateDoc(doc(db, 'orders', orderId), {
    quote: {
      unitPrice: Number(quote.unitPrice) || 0,
      estimatedTime: quote.estimatedTime || '',
      notes: quote.notes || '',
      total: Number(quote.total) || 0,
      generatedAt: new Date().toISOString(),
    },
    updatedAt: serverTimestamp(),
  });
  invalidateOrderCache();
}

export async function deleteOrder(orderId, sellerUid = '') {
  const resolvedSellerUid = await resolveSellerUid(orderId, sellerUid);
  const batch = writeBatch(db);
  batch.delete(doc(db, 'orders', orderId));
  if (resolvedSellerUid) batch.delete(doc(db, 'sellerOrders', resolvedSellerUid, 'orders', orderId));
  await batch.commit();
  invalidateOrderCache();
  invalidateSellerOrderCache(resolvedSellerUid);
}
