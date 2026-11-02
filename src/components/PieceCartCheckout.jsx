import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getCustomerByWhatsapp, saveCustomerOrderSnapshot } from '../lib/customerRepo';
import { createOrder } from '../lib/orderRepo';
import { readPieceCart, removePieceFromCart, clearPieceCart, cartQuantity } from '../lib/multiPieceCart';
import { readSimulatorQuoteDraft, clearSimulatorQuoteDraft } from '../lib/simulatorQuoteDraft';
import '../piece-cart.css';

export default function PieceCartCheckout({ staffUser }) {
  const navigate = useNavigate();
  const uid = staffUser?.uid;
  const [items, setItems] = useState(() => readPieceCart(uid));
  const [showCheckout, setShowCheckout] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [customerFound, setCustomerFound] = useState(null);
  const [busy, setBusy] = useState(false);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [error, setError] = useState('');
  const simulatedQuote = readSimulatorQuoteDraft(uid, items);

  useEffect(() => {
    const refresh = () => setItems(readPieceCart(uid));
    refresh();
    window.addEventListener('koleni:cart-changed', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('koleni:cart-changed', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, [uid]);

  async function lookup() {
    if (!whatsapp.trim()) return setError('Informe o WhatsApp para buscar o cadastro.');
    setLookupBusy(true);
    setError('');
    try {
      const customer = await getCustomerByWhatsapp(whatsapp);
      setCustomerFound(customer);
      if (customer?.name) setCustomerName(customer.name);
    } catch (err) {
      setError(err.message || 'Não foi possível consultar o cadastro.');
    } finally {
      setLookupBusy(false);
    }
  }

  function remove(id) {
    if (busy) return;
    try { setItems(removePieceFromCart(uid, id)); }
    catch (err) { setError(err.message); }
  }

  async function finish(event) {
    event.preventDefault();
    if (busy) return;
    const current = readPieceCart(uid);
    if (!current.length) return setError('Adicione ao menos uma peça.');
    if (!customerName.trim() || !whatsapp.trim()) return setError('Informe nome e WhatsApp do cliente.');
    setBusy(true);
    setError('');
    try {
      const first = current[0];
      const { id: cartItemId, ...firstData } = first;
      const total = cartQuantity(current);
      const quote = readSimulatorQuoteDraft(uid, current);
      const firstImage = first.finalImageUrl || Object.values(first.finalImages || {}).find(Boolean) || '';
      const id = await createOrder({
        ...firstData,
        garmentName: current.length === 1 ? first.garmentName : `${current.length} modelos personalizados`,
        customerName: customerName.trim(),
        whatsapp: whatsapp.trim(),
        sellerUid: uid,
        sellerEmail: staffUser?.email || '',
        quantity: total,
        items: current,
        ...(quote ? { quote } : {}),
        finalImageUrl: firstImage,
      });
      try {
        await saveCustomerOrderSnapshot({
          customerName: customerName.trim(),
          whatsapp: whatsapp.trim(),
          sellerEmail: staffUser?.email || '',
          garmentId: first.garmentId,
          garmentName: first.garmentName,
          colorChoices: first.colorChoices || {},
          logos: first.logos || [],
          texts: first.texts || [],
          sizeGrid: first.sizeGrid || {},
          quantity: first.quantity,
        });
      } catch (snapshotError) {
        console.warn('Pedido salvo; histórico de cliente não sincronizado:', snapshotError);
      }
      clearPieceCart(uid);
      clearSimulatorQuoteDraft(uid);
      navigate(`/ficha-tecnica/${id}`);
    } catch (err) {
      setError(err.message || 'Não foi possível finalizar o pedido. As peças foram mantidas no carrinho.');
    } finally {
      setBusy(false);
    }
  }

  if (!items.length) return <div className="piece-cart-empty">Quer vender modelos diferentes em um único pedido? Personalize uma peça e clique em <strong>Adicionar ao pedido com várias peças</strong>.</div>;

  return <section className="piece-cart panel" aria-label="Peças adicionadas ao pedido">
    <header className="piece-cart-heading">
      <div><span>Pedido em montagem</span><h2>{items.length} {items.length === 1 ? 'modelo' : 'modelos'} · {cartQuantity(items)} peças</h2><p>Personalize outros modelos ou finalize tudo com um único código.</p></div>
      <div className="piece-cart-primary-actions">
          <Link className="button button-secondary" to="/simulador">Simular preços</Link>
          <button type="button" className="button button-primary" onClick={() => setShowCheckout((s) => !s)} disabled={busy}>{showCheckout ? 'Fechar' : 'Finalizar pedido completo'}</button>
        </div>
    </header>
    <div className="piece-cart-list">
      {items.map((item, index) => <div className="piece-cart-entry" key={item.id || index}>
        {item.finalImageUrl && <img src={item.finalImageUrl} alt={item.garmentName || 'Arte final'} />}
        <div><strong>{index + 1}. {item.garmentName || 'Peça personalizada'}</strong><small>{item.quantity} unidade(s) · {Object.entries(item.sizeGrid || {}).filter(([, n]) => Number(n) > 0).map(([size, n]) => `${size}: ${n}`).join(' · ') || 'Quantidade total informada'}</small></div>
        <button type="button" className="button button-secondary" onClick={() => remove(item.id)} disabled={busy} aria-label={`Retirar ${item.garmentName} do pedido`}>Remover</button>
      </div>)}
    </div>
    {simulatedQuote && <div className="piece-cart-simulation">
      <span>Preços sugeridos aplicados da tabela Koleni</span>
      <strong>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(simulatedQuote.total)}</strong>
      <Link to="/simulador">Recalcular</Link>
    </div>}
    {error && <div className="notice notice-error">{error}</div>}
    {showCheckout && <form className="piece-cart-checkout" onSubmit={finish}>
      <h3>Finalizar pedido · {items.length} modelos</h3>
      <p>O cliente será associado a todas as peças deste pedido.</p>
      <div className="piece-cart-checkout-fields">
        <label>WhatsApp do cliente<input type="tel" required value={whatsapp} onChange={(e) => { setWhatsapp(e.target.value); setCustomerFound(null); }} disabled={busy} placeholder="(62) 99999-9999" /></label>
        <button className="button button-secondary" type="button" onClick={lookup} disabled={busy || lookupBusy}>{lookupBusy ? 'Buscando…' : 'Buscar cliente'}</button>
        <label>Nome ou empresa<input required value={customerName} onChange={(e) => setCustomerName(e.target.value)} disabled={busy} placeholder="Nome do cliente" /></label>
      </div>
      {customerFound && <p className="piece-cart-found">Cadastro encontrado: {customerFound.name || 'Cliente recorrente'}</p>}
      <div className="piece-cart-footer"><strong>{cartQuantity(items)} peças, {items.length} personalizações{simulatedQuote ? ' · valor simulado anexado' : ''}</strong><button type="submit" className="button button-primary" disabled={busy}>{busy ? 'Gravando pedido…' : 'Confirmar pedido e abrir ficha técnica'}</button></div>
    </form>}
  </section>;
}
