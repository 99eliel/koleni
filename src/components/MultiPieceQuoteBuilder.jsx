import { useState } from 'react';
import { MARTINPEL_LOGO_DATA_URL } from '../lib/martinpelLogo';
import { saveOrderQuote } from '../lib/orderRepo';
import { buildMultiPieceQuoteHtml } from '../lib/multiQuoteHtml';
import OrderOperationsPanel from './OrderOperationsPanel';

const money = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);
const VIEW_LABELS = { front: 'Frente / Foto 1', back: 'Costas / Foto 2', combined: 'Foto 3' };

function priceNumber(value) {
  return Number(String(value || '').replace(',', '.'));
}

function imagesFor(item) {
  const images = Object.entries(item.finalImages || {})
    .filter(([, url]) => Boolean(url))
    .sort(([a], [b]) => ['front', 'back', 'combined'].indexOf(a) - ['front', 'back', 'combined'].indexOf(b));
  if (!images.length && item.finalImageUrl) images.push(['final', item.finalImageUrl]);
  return images.slice(0, 3);
}

export default function MultiPieceQuoteBuilder({ order, disabled, onSaved }) {
  const items = Array.isArray(order.items) ? order.items : [];
  const [open, setOpen] = useState(Boolean(order.quote));
  const [prices, setPrices] = useState(() => items.map((item, index) => {
    const previous = (order.quote?.items || []).find((saved) => saved.id && saved.id === item.id)
      || order.quote?.items?.[index];
    return previous?.unitPrice ? String(previous.unitPrice) : '';
  }));
  const [descriptions, setDescriptions] = useState(() => items.map((item, index) => {
    const previous = (order.quote?.items || []).find((saved) => saved.id && saved.id === item.id)
      || order.quote?.items?.[index];
    return previous?.description || '';
  }));
  const [estimatedTime, setEstimatedTime] = useState(order.quote?.estimatedTime || '');
  const [notes, setNotes] = useState(order.quote?.notes || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const lines = items.map((item, index) => {
    const unitPrice = priceNumber(prices[index]);
    const quantity = Number(item.quantity) || 0;
    return {
      ...item,
      unitPrice,
      quantity,
      description: descriptions[index] || '',
      total: Number.isFinite(unitPrice) ? Math.round(quantity * unitPrice * 100) / 100 : 0,
    };
  });
  const total = Math.round(lines.reduce((sum, item) => sum + (Number.isFinite(item.total) ? item.total : 0), 0) * 100) / 100;
  const totalQuantity = lines.reduce((sum, item) => sum + item.quantity, 0);

  function changePrice(index, value) {
    setPrices((current) => current.map((price, i) => i === index ? value : price));
    setError('');
  }

  function changeDescription(index, value) {
    setDescriptions((current) => current.map((description, i) => i === index ? value : description));
  }

  async function generateQuote() {
    if (busy || disabled) return;
    if (!lines.length || lines.some((item) => !Number.isFinite(item.unitPrice) || item.unitPrice <= 0)) {
      setError('Informe o preço unitário de cada modelo (valor maior que zero).');
      return;
    }
    if (!estimatedTime.trim()) {
      setError('Informe o prazo estimado para o pedido completo.');
      return;
    }

    // A janela é aberta durante o clique, antes de qualquer await, para evitar bloqueio de pop-ups.
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      setError('Permita pop-ups para gerar o orçamento com fotos em uma nova janela.');
      return;
    }
    printWindow.document.open();
    printWindow.document.write('<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Preparando orçamento Koleni</title></head><body style="font:16px Arial;padding:30px;color:#333">Preparando orçamento da Koleni...</body></html>');
    printWindow.document.close();

    setBusy(true);
    setError('');
    try {
      await saveOrderQuote(order.id, {
        items: lines.map((item) => ({
          id: item.id || '',
          garmentId: item.garmentId,
          garmentName: item.garmentName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: item.total,
          description: item.description.trim(),
        })),
        total,
        estimatedTime: estimatedTime.trim(),
        notes: notes.trim(),
      });
      const html = buildMultiPieceQuoteHtml({
        order,
        lines,
        total,
        estimatedTime: estimatedTime.trim(),
        notes: notes.trim(),
        logoUrl: MARTINPEL_LOGO_DATA_URL,
      });
      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
      try {
        await onSaved?.();
      } catch (refreshError) {
        console.warn('Orçamento salvo, mas não foi possível atualizar a lista agora:', refreshError);
      }
    } catch (err) {
      printWindow.close();
      setError(err.message || 'Não foi possível salvar o orçamento. Confira sua conexão e tente novamente.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="multi-quote">
      <button
        className="button button-secondary order-quote-toggle"
        type="button"
        disabled={disabled || busy}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? 'Fechar orçamento' : order.quote ? 'Editar orçamento com fotos' : 'Criar orçamento com fotos por modelo'}
      </button>
      {open && (
        <div className="order-quote-form multi-quote-form">
          <div className="multi-quote-heading">
            <strong>Orçamento detalhado por modelo</strong>
            <span>{items.length} personalizações · {totalQuantity} peças</span>
            <small>Cada modelo terá fotos, grade, personalização e valores próprios no mesmo PDF.</small>
          </div>
          {lines.map((item, index) => {
            const imageList = imagesFor(item);
            const sizes = Object.entries(item.sizeGrid || {}).filter(([, amount]) => Number(amount) > 0);
            return (
              <section className="multi-quote-item" key={item.id || index}>
                <header className="multi-quote-item-head">
                  <b>{index + 1}</b>
                  <div><strong>{item.garmentName || 'Modelo personalizado'}</strong><span>{item.quantity} unidade(s)</span></div>
                </header>
                {imageList.length > 0 ? (
                  <div className="multi-quote-art-grid">
                    {imageList.map(([view, url]) => (
                      <figure key={view}>
                        <img src={url} alt={VIEW_LABELS[view] || 'Arte final'} loading="lazy" />
                        <figcaption>{VIEW_LABELS[view] || 'Arte final'}</figcaption>
                      </figure>
                    ))}
                  </div>
                ) : <p className="multi-quote-no-image">Esta peça ainda não possui foto final.</p>}
                <div className="multi-quote-sizes">
                  <strong>Grade:</strong>
                  <span>{sizes.length ? sizes.map(([size, amount]) => size + ': ' + amount).join(' · ') : 'Não informada'}</span>
                </div>
                <label className="multi-quote-description">
                  Especificação / acabamento deste modelo (opcional)
                  <textarea
                    rows={2}
                    maxLength={800}
                    value={descriptions[index] || ''}
                    placeholder="Ex.: logo bordada no peito esquerdo e nome estampado nas costas"
                    disabled={disabled || busy}
                    onChange={(event) => changeDescription(index, event.target.value)}
                  />
                </label>
                <div className="multi-quote-prices">
                  <label>
                    Preço por peça (R$)
                    <input
                      type="number" min="0.01" step="0.01" inputMode="decimal" required
                      value={prices[index] || ''}
                      onChange={(event) => changePrice(index, event.target.value)}
                      disabled={disabled || busy}
                      placeholder="Ex.: 89,90"
                    />
                  </label>
                  <div><span>Quantidade</span><strong>{item.quantity}</strong></div>
                  <div className="multi-quote-item-total"><span>Subtotal</span><strong>{money(item.total)}</strong></div>
                </div>
              </section>
            );
          })}
          <label>Prazo estimado do pedido completo
            <input value={estimatedTime} onChange={(event) => setEstimatedTime(event.target.value)} maxLength={150} disabled={disabled || busy} placeholder="Ex.: 15 dias úteis" />
          </label>
          <label>Observações gerais / condições (opcional)
            <textarea rows={2} maxLength={1200} value={notes} onChange={(event) => setNotes(event.target.value)} disabled={disabled || busy} placeholder="Ex.: pagamento, frete, validade da proposta" />
          </label>
          <div className="order-quote-total multi-quote-grand-total"><span>Valor total · {totalQuantity} peças</span><strong>{money(total)}</strong></div>
          {error && <div className="order-quote-error">{error}</div>}
          <button className="button button-primary multi-quote-submit" type="button" disabled={busy || disabled} onClick={generateQuote}>
            {busy ? 'Salvando e preparando o PDF…' : 'Gerar orçamento completo com fotos / PDF'}
          </button>
        </div>
      )}
      <OrderOperationsPanel order={order} disabled={disabled || busy} onSaved={onSaved} />
    </div>
  );
}
