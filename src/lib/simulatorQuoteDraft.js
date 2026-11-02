// Orçamento simulado no navegador, vinculado exatamente ao conjunto de peças do carrinho.
// Nenhum preço é aplicado automaticamente sem conferência e confirmação do vendedor.
const PREFIX = 'koleni-simulacao-carrinho-v1';
const key = (uid) => `${PREFIX}:${uid}`;

function fingerprint(items = []) {
  return JSON.stringify(items.map((item) => [item.id, item.garmentId, Number(item.quantity)]));
}

export function saveSimulatorQuoteDraft(uid, cartItems, quote) {
  if (!uid || !cartItems?.length || !quote?.items?.length) throw new Error('Pedido ou preços incompletos.');
  const record = { fingerprint: fingerprint(cartItems), quote, createdAt: Date.now() };
  try {
    localStorage.setItem(key(uid), JSON.stringify(record));
  } catch {
    throw new Error('Não foi possível guardar os preços neste navegador.');
  }
  window.dispatchEvent(new CustomEvent('koleni:simulation-changed'));
  return record;
}

export function readSimulatorQuoteDraft(uid, cartItems = []) {
  if (!uid || !cartItems.length) return null;
  try {
    const record = JSON.parse(localStorage.getItem(key(uid)) || 'null');
    if (!record || record.fingerprint !== fingerprint(cartItems)) return null;
    if (!record.createdAt || Date.now() - record.createdAt > 7 * 24 * 60 * 60 * 1000) return null;
    if (!Array.isArray(record.quote?.items) || record.quote.items.length !== cartItems.length) return null;
    return record.quote;
  } catch {
    return null;
  }
}

export function clearSimulatorQuoteDraft(uid) {
  if (!uid) return;
  localStorage.removeItem(key(uid));
  window.dispatchEvent(new CustomEvent('koleni:simulation-changed'));
}