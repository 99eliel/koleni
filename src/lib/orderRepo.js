import {
  collection,
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
    texts: data.texts ?? [],
    sizeScale: data.sizeScale ?? null,
    sizeGrid: data.sizeGrid ?? {},
    quantity: data.quantity ?? null,
    items: Array.isArray(data.items) ? data.items : [],
    notes: data.notes ?? '',
  };
}

function approvalToken() {
  const random = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${random.replace(/[^a-zA-Z0-9-]/g, '')}-${Math.random().toString(36).slice(2, 12)}`;
}

function orderDisplayCode(sequence) {
  return `KL-${String(sequence).padStart(6, '0')}`;
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
    itemCount: Array.isArray(data.items) ? data.items.length : 1,
    items: Array.isArray(data.items) ? data.items.map((item) => ({
      id: item.id || '',
      garmentId: item.garmentId || '',
      garmentName: item.garmentName || '',
      quantity: Number(item.quantity) || 0,
      sizeScale: item.sizeScale ?? null,
      sizeGrid: item.sizeGrid ?? {},
      finalImages: item.finalImages ?? {},
      finalImageUrl: item.finalImageUrl || '',
    })) : [],
    sizeScale: data.sizeScale ?? null,
    sizeGrid: data.sizeGrid ?? {},
    status: 'pending',
    approvalStatus: 'pending',
    approvalToken: token,
    approvalNote: '',
    designVersion: 1,
    finalImageUrl: data.finalImageUrl || '',
    expireAt,
    createdAt: Timestamp.fromDate(now),
    updatedAt: Timestamp.fromDate(now),
  };
}

export async function createOrder(data) {
  if (!data?.sellerUid) throw new Error('Vendedor não identificado. Entre novamente no sistema.');
  if (Array.isArray(data.items)) {
    if (data.items.length < 1 || data.items.length > 20) {
      throw new Error('Informe entre 1 e 20 personalizações no pedido.');
    }
    for (const item of data.items) {
      if (!item.garmentId || !Number.isInteger(Number(item.quantity)) || Number(item.quantity) < 1) {
        throw new Error('Todas as peças precisam de um modelo e quantidade válidos.');
      }
    }
    const actualQuantity = data.items.reduce((sum, item) => sum + Number(item.quantity), 0);
    if (actualQuantity !== Number(data.quantity)) {
      throw new Error('A quantidade total precisa corresponder à soma das peças.');
    }
  }

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
      approvalNote: '',
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
      items: Array.isArray(data.items) ? data.items.map((item) => ({
        id: item.id || '',
        garmentName: item.garmentName || '',
        quantity: Number(item.quantity) || 0,
        sizeGrid: item.sizeGrid ?? {},
        finalImages: item.finalImages ?? {},
        finalImageUrl: item.finalImageUrl || '',
      })) : [],
      designVersion: 1,
      finalImages: data.finalImages ?? {},
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

export async function getOrderById(orderId) {
  if (!orderId) return null;
  const snapshot = await getDoc(doc(db, 'orders', orderId));
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}

export async function getOrderForRevision(orderId) {
  return getOrderById(orderId);
}

export async function saveTechnicalSheet(orderId, technicalSheet = {}) {
  if (!orderId) throw new Error('Pedido inválido.');

  const clean = (value, max = 180) => String(value ?? '').trim().slice(0, max);
  const fields = technicalSheet?.fields || {};
  const itemIndex = technicalSheet?.itemIndex;

  const cleanFields = {
        description: clean(fields.description),
        reference: clean(fields.reference),
        fabric: clean(fields.fabric),
        customer: clean(fields.customer),
        color: clean(fields.color),
        print: clean(fields.print),
        weight: clean(fields.weight),
        printColor: clean(fields.printColor),
        notes: clean(fields.notes, 500),
  };
  if (Number.isInteger(itemIndex) && itemIndex >= 0) {
    const ref = doc(db, 'orders', orderId);
    const snapshot = await getDoc(ref);
    if (!snapshot.exists()) throw new Error('Pedido não encontrado.');
    const order = snapshot.data();
    const itemCount = Array.isArray(order.items) ? order.items.length : 0;
    if (itemIndex >= itemCount) throw new Error('Peça não encontrada neste pedido.');
    const saved = order.technicalSheet || {};
    const itemFields = Array.from({ length: itemCount }, (_, index) =>
      saved.items?.[index] || { fields: index === 0 ? (saved.fields || {}) : {} });
    itemFields[itemIndex] = { fields: cleanFields, savedAt: new Date().toISOString() };
    await updateDoc(ref, {
      technicalSheet: {
        ...saved,
        fields: itemIndex === 0 ? cleanFields : (saved.fields || {}),
        items: itemFields,
        savedAt: new Date().toISOString(),
      },
      updatedAt: serverTimestamp(),
    });
    invalidateOrderCache();
    return;
  }

  await updateDoc(doc(db, 'orders', orderId), {
    technicalSheet: {
      fields: {
        description: clean(fields.description),
        reference: clean(fields.reference),
        fabric: clean(fields.fabric),
        customer: clean(fields.customer),
        color: clean(fields.color),
        print: clean(fields.print),
        weight: clean(fields.weight),
        printColor: clean(fields.printColor),
        notes: clean(fields.notes, 500),
      },
      savedAt: new Date().toISOString(),
    },
    updatedAt: serverTimestamp(),
  });

  invalidateOrderCache();
}

export async function saveOrderRevision(orderId, data) {
  const orderRef = doc(db, 'orders', orderId);
  const orderSnapshot = await getDoc(orderRef);
  if (!orderSnapshot.exists()) throw new Error('Pedido não encontrado.');

  const current = orderSnapshot.data();
  if (current.approvalStatus !== 'changes_requested') {
    throw new Error('Este pedido não está aguardando uma alteração solicitada pelo cliente.');
  }

  const now = new Date();
  const nextVersion = Math.max(1, Number(current.designVersion) || 1) + 1;
  const token = approvalToken();
  const expireAt = Timestamp.fromDate(new Date(now.getTime() + (90 * 24 * 60 * 60 * 1000)));
  const sellerUid = current.sellerUid || '';
  const previewRef = doc(db, 'approvalPreviews', token);
  const sellerOrderRef = sellerUid ? doc(db, 'sellerOrders', sellerUid, 'orders', orderId) : null;
  const history = Array.isArray(current.designHistory) ? current.designHistory : [];
  const itemIndex = Array.isArray(current.items) ? Number(data.itemIndex ?? 0) : -1;
  if (itemIndex >= 0 && (!Number.isInteger(itemIndex) || itemIndex >= current.items.length)) {
    throw new Error('Peça selecionada inválida.');
  }
  const nextItems = itemIndex >= 0 ? current.items.map((item, index) =>
    index === itemIndex ? {
      ...item,
      colorChoices: data.colorChoices ?? item.colorChoices ?? {},
      logos: data.logos ?? item.logos ?? [],
      texts: data.texts ?? item.texts ?? [],
      finalImages: data.finalImages ?? item.finalImages ?? {},
      finalImageUrl: data.finalImageUrl || Object.values(data.finalImages || {}).find(Boolean) || item.finalImageUrl || '',
    } : item
  ) : null;
  const updatePrimary = itemIndex <= 0;
  const nextFinalImages = updatePrimary ? (data.finalImages ?? current.finalImages ?? {}) : (current.finalImages ?? {});
  const finalImageUrl = updatePrimary
    ? (data.finalImageUrl || Object.values(nextFinalImages).find(Boolean) || current.finalImageUrl || '')
    : (current.finalImageUrl || '');

  const nextHistory = [
    ...history,
    {
      version: nextVersion,
      savedAt: now.toISOString(),
      requestedChange: current.approvalNote || '',
      garmentId: current.garmentId,
      garmentName: current.garmentName,
      colorChoices: data.colorChoices ?? current.colorChoices ?? {},
      logos: data.logos ?? current.logos ?? [],
      texts: data.texts ?? current.texts ?? [],
      sizeScale: current.sizeScale ?? null,
      sizeGrid: current.sizeGrid ?? {},
      quantity: current.quantity ?? null,
      finalImageUrl,
      ...(nextItems ? { items: nextItems } : {}),
      editedItemIndex: itemIndex,
    },
  ];

  const batch = writeBatch(db);
  batch.update(orderRef, {
    colorChoices: updatePrimary ? (data.colorChoices ?? current.colorChoices ?? {}) : (current.colorChoices ?? {}),
    logos: updatePrimary ? (data.logos ?? current.logos ?? []) : (current.logos ?? []),
    texts: updatePrimary ? (data.texts ?? current.texts ?? []) : (current.texts ?? []),
    ...(nextItems ? { items: nextItems } : {}),
    finalImages: nextFinalImages,
    finalImageUrl,
    designVersion: nextVersion,
    designHistory: nextHistory,
    approvalToken: token,
    approvalStatus: 'pending',
    approvalProof: null,
    approvalNote: '',
    approvalRespondedAt: null,
    status: 'approval',
    expireAt,
    updatedAt: serverTimestamp(),
  });

  batch.set(previewRef, {
    orderId,
    displayCode: current.displayCode || orderId,
    customerName: current.customerName || '',
    garmentName: current.garmentName || current.garmentId || '',
    quantity: Number(current.quantity) || 0,
    ...(nextItems ? { items: nextItems.map((item) => ({
      id: item.id || '',
      garmentName: item.garmentName || '',
      quantity: Number(item.quantity) || 0,
      sizeGrid: item.sizeGrid || {},
      finalImages: item.finalImages || {},
      finalImageUrl: item.finalImageUrl || '',
    })) } : {}),
    designVersion: nextVersion,
    finalImages: nextFinalImages,
    finalImageUrl,
    sellerUid,
    status: 'pending',
    expireAt,
    createdAt: serverTimestamp(),
  });

  if (sellerOrderRef) {
    batch.set(sellerOrderRef, {
      approvalToken: token,
      approvalStatus: 'pending',
      approvalProof: null,
      approvalNote: '',
      designVersion: nextVersion,
      finalImageUrl,
      status: 'approval',
      expireAt,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  }

  await batch.commit();
  invalidateOrderCache();
  invalidateSellerOrderCache(sellerUid);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('martinpel:order-revised', {
      detail: { id: orderId, displayCode: current.displayCode || orderId, designVersion: nextVersion, approvalToken: token },
    }));
  }

  return { orderId, designVersion: nextVersion, approvalToken: token };
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

export async function listSellerDetailedOrders(uid, { force = false, maxItems = DEFAULT_SELLER_ORDER_LIMIT } = {}) {
  const summaries = await listSellerOrders(uid, { force, maxItems });
  if (!summaries.length) return [];

  const detailed = await Promise.all(
    summaries.map(async (summary) => {
      const orderId = summary.orderId || summary.id;
      try {
        const snapshot = await getDoc(doc(db, 'orders', orderId));
        return snapshot.exists()
          ? { id: snapshot.id, ...snapshot.data() }
          : { ...summary, id: orderId };
      } catch {
        return { ...summary, id: orderId };
      }
    }),
  );

  return detailed;
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
  if (!orderId) throw new Error('Pedido não identificado.');
  const quoteItems = Array.isArray(quote?.items) ? quote.items : [];
  const normalizedItems = quoteItems.map((item) => ({
    id: String(item.id || '').slice(0, 120),
    garmentId: String(item.garmentId || '').slice(0, 120),
    garmentName: String(item.garmentName || '').slice(0, 180),
    quantity: Math.max(0, Math.floor(Number(item.quantity) || 0)),
    unitPrice: Number(item.unitPrice) || 0,
    total: Number(item.total) || 0,
    description: String(item.description || '').trim().slice(0, 800),
  }));
  if (normalizedItems.length) {
    if (normalizedItems.length > 20 || normalizedItems.some(
      (item) => !item.garmentId || item.quantity < 1 || !Number.isFinite(item.unitPrice) || item.unitPrice <= 0,
    )) {
      throw new Error('Verifique a quantidade e o preço de cada modelo do orçamento.');
    }
  }
  await updateDoc(doc(db, 'orders', orderId), {
    quote: {
      unitPrice: normalizedItems.length ? 0 : (Number(quote.unitPrice) || 0),
      ...(normalizedItems.length ? { items: normalizedItems } : {}),
      estimatedTime: String(quote.estimatedTime || '').trim().slice(0, 150),
      notes: String(quote.notes || '').trim().slice(0, 1200),
      total: normalizedItems.length
        ? Math.round(normalizedItems.reduce((sum, item) => sum + item.total, 0) * 100) / 100
        : (Number(quote.total) || 0),
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