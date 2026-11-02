// Carrinho local por vendedor. Artes são exportadas para o Storage antes de entrar no carrinho.
const KEY = 'koleni-pedido-multipeças-v1';
const MAX_ITEMS = 20;
function key(uid) { return `${KEY}:${uid}`; }

export function readPieceCart(uid) {
  if (!uid || typeof localStorage === 'undefined') return [];
  try {
    const data = JSON.parse(localStorage.getItem(key(uid)) || '[]');
    return Array.isArray(data) ? data.filter((item) => item && item.garmentId && Number(item.quantity) > 0).slice(0, MAX_ITEMS) : [];
  } catch {
    return [];
  }
}

export function savePieceCart(uid, items) {
  if (!uid) throw new Error('Entre novamente para preparar o pedido.');
  if (!Array.isArray(items) || items.length > MAX_ITEMS) throw new Error('O pedido aceita até 20 personalizações diferentes.');
  try {
    if (items.length) localStorage.setItem(key(uid), JSON.stringify(items));
    else localStorage.removeItem(key(uid));
  } catch {
    throw new Error('Não foi possível salvar o carrinho neste navegador. Remova outros dados locais e tente novamente.');
  }
  window.dispatchEvent(new CustomEvent('koleni:cart-changed'));
  return items;
}

export function addPieceToCart(uid, piece) {
  const current = readPieceCart(uid);
  if (current.length >= MAX_ITEMS) throw new Error('Limite de 20 modelos por pedido.');
  const item = {
    ...piece,
    id: crypto.randomUUID?.() || `item-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    addedAt: new Date().toISOString(),
  };
  savePieceCart(uid, [...current, item]);
  return item;
}

export function removePieceFromCart(uid, id) {
  return savePieceCart(uid, readPieceCart(uid).filter((item) => item.id !== id));
}

export function clearPieceCart(uid) {
  return savePieceCart(uid, []);
}

export function cartQuantity(items) {
  return items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
}
