import { useState } from 'react';
import { MARTINPEL_LOGO_DATA_URL } from '../lib/martinpelLogo';
import { saveOrderQuote } from '../lib/orderRepo';
import OrderOperationsPanel from './OrderOperationsPanel';

function money(value) {
  const number = Number(value) || 0;
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(number);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function quoteImage(order) {
  return order.finalImages?.combined
    || order.finalImages?.front
    || order.finalImages?.back
    || order.finalImageUrl
    || '';
}

export default function OrderQuoteBuilder({ order, disabled, onSaved }) {
  const [open, setOpen] = useState(Boolean(order.quote));
  const [unitPrice, setUnitPrice] = useState(order.quote?.unitPrice ? String(order.quote.unitPrice) : '');
  const [estimatedTime, setEstimatedTime] = useState(order.quote?.estimatedTime ?? '');
  const [notes, setNotes] = useState(order.quote?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const quantity = Number(order.quantity) || 0;
  const numericUnitPrice = Number(String(unitPrice).replace(',', '.')) || 0;
  const total = quantity > 0 ? numericUnitPrice * quantity : numericUnitPrice;

  async function generateQuote() {
    if (numericUnitPrice <= 0) {
      setError('Informe um valor maior que zero.');
      return;
    }
    if (!estimatedTime.trim()) {
      setError('Informe o prazo estimado.');
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      setError('O navegador bloqueou a janela do orçamento. Permita pop-ups para este site e tente novamente.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const quote = {
        unitPrice: numericUnitPrice,
        estimatedTime: estimatedTime.trim(),
        notes: notes.trim(),
        total,
      };
      await saveOrderQuote(order.id, quote);
      await onSaved?.();

      const image = quoteImage(order);
      const generatedAt = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' }).format(new Date());
      const quantityText = quantity > 0 ? `${quantity} unidade(s)` : 'Não informada';
      const priceLabel = quantity > 0 ? 'Valor unitário' : 'Valor do orçamento';
      const customer = escapeHtml(order.customerName || 'Cliente não informado');
      const whatsapp = escapeHtml(order.whatsapp || 'Não informado');
      const garment = escapeHtml(order.garmentName || order.garmentId || 'Peça personalizada');
      const safeNotes = escapeHtml(notes.trim()).replaceAll('\n', '<br>');

      printWindow.document.open();
      printWindow.document.write(`<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>Orçamento Martinpel - ${escapeHtml(order.id)}</title>
<style>@page{size:A4;margin:14mm}*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;color:#0f172a;background:#fff}.sheet{max-width:800px;margin:0 auto}.brand{background:#02254d;padding:18px 24px;border-radius:14px;display:flex;align-items:center;justify-content:center}.brand img{max-width:360px;width:70%;height:auto}.title{display:flex;justify-content:space-between;gap:20px;align-items:flex-end;margin:26px 0 18px;padding-bottom:14px;border-bottom:2px solid #e2e8f0}.title h1{font-size:28px;margin:0}.title p{margin:5px 0 0;color:#64748b}.code{text-align:right;font-size:12px;color:#64748b}.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:18px}.box{border:1px solid #e2e8f0;border-radius:10px;padding:12px}.box span{display:block;font-size:10px;text-transform:uppercase;font-weight:700;color:#64748b;letter-spacing:.06em}.box strong{display:block;margin-top:5px;font-size:15px}.product{display:grid;grid-template-columns:240px 1fr;gap:18px;align-items:start;border:1px solid #e2e8f0;border-radius:14px;padding:16px;margin:18px 0}.product-image{height:260px;border-radius:10px;background:#f1f5f9;display:flex;align-items:center;justify-content:center;overflow:hidden}.product-image img{max-width:100%;max-height:100%;object-fit:contain}.product h2{margin:0 0 14px;font-size:20px}.price-table{width:100%;border-collapse:collapse}.price-table td{padding:9px 0;border-bottom:1px solid #e2e8f0}.price-table td:last-child{text-align:right;font-weight:700}.price-table tr.total td{font-size:18px;border-bottom:0;padding-top:14px;color:#166534}.notes{margin-top:16px;padding:14px;border-radius:10px;background:#f8fafc;border:1px solid #e2e8f0}.notes h3{margin:0 0 7px;font-size:13px}.notes p{margin:0;color:#475569;line-height:1.45}.footer{margin-top:28px;padding-top:14px;border-top:1px solid #e2e8f0;color:#64748b;font-size:11px;text-align:center}.print-actions{position:fixed;right:20px;bottom:20px}@media print{.print-actions{display:none}.brand{print-color-adjust:exact;-webkit-print-color-adjust:exact}.sheet{max-width:none}}@media(max-width:650px){.grid,.product{grid-template-columns:1fr}.product-image{height:220px}.brand img{width:90%}}</style></head>
<body><div class="sheet"><div class="brand"><img src="${MARTINPEL_LOGO_DATA_URL}" alt="Martinpel Uniformes e EPI's"></div><div class="title"><div><h1>Orçamento</h1><p>Uniforme personalizado conforme solicitação do cliente</p></div><div class="code">Pedido<br><strong>${escapeHtml(order.id)}</strong><br>${generatedAt}</div></div><div class="grid"><div class="box"><span>Cliente</span><strong>${customer}</strong></div><div class="box"><span>WhatsApp</span><strong>${whatsapp}</strong></div><div class="box"><span>Peça</span><strong>${garment}</strong></div><div class="box"><span>Quantidade</span><strong>${quantityText}</strong></div></div><div class="product"><div class="product-image">${image ? `<img src="${escapeHtml(image)}" alt="Arte final da peça">` : '<span>Sem imagem final</span>'}</div><div><h2>${garment}</h2><table class="price-table"><tr><td>${priceLabel}</td><td>${money(numericUnitPrice)}</td></tr>${quantity > 0 ? `<tr><td>Quantidade</td><td>${quantity}</td></tr>` : ''}<tr><td>Prazo estimado</td><td>${escapeHtml(estimatedTime.trim())}</td></tr><tr class="total"><td>Valor total</td><td>${money(total)}</td></tr></table></div></div>${safeNotes ? `<div class="notes"><h3>Observações</h3><p>${safeNotes}</p></div>` : ''}<div class="footer">MARTINPEL — Uniformes e EPI's • Orçamento gerado pelo sistema de customização.</div></div><button class="print-actions" onclick="window.print()">Imprimir / Salvar em PDF</button><script>window.addEventListener('load',()=>setTimeout(()=>window.print(),400));<\/script></body></html>`);
      printWindow.document.close();
    } catch (err) {
      printWindow.close();
      setError(`Não foi possível gerar o orçamento: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="order-quote-builder">
        <button className="button button-secondary order-quote-toggle" type="button" disabled={disabled || busy} onClick={() => setOpen((value) => !value)}>
          {open ? 'Fechar orçamento' : order.quote ? 'Editar / gerar orçamento' : 'Criar orçamento'}
        </button>

        {open && (
          <div className="order-quote-form">
            <div className="order-quote-grid">
              <label>Valor unitário (R$)<input type="number" min="0" step="0.01" value={unitPrice} onChange={(event) => setUnitPrice(event.target.value)} placeholder="Ex.: 89,90" /></label>
              <label>Prazo estimado<input value={estimatedTime} onChange={(event) => setEstimatedTime(event.target.value)} placeholder="Ex.: 15 dias úteis" /></label>
            </div>
            <label>Observação (opcional)<textarea rows="2" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Ex.: Frete não incluso; validade do orçamento..." /></label>
            <div className="order-quote-total"><span>{quantity > 0 ? `${quantity} × ${money(numericUnitPrice)}` : 'Total do orçamento'}</span><strong>{money(total)}</strong></div>
            {error && <div className="order-quote-error">{error}</div>}
            <button className="button button-primary full-width" type="button" disabled={busy || disabled} onClick={generateQuote}>{busy ? 'Gerando orçamento…' : 'Gerar orçamento / PDF'}</button>
          </div>
        )}
      </div>

      <OrderOperationsPanel order={order} disabled={disabled || busy} onSaved={onSaved} />
    </>
  );
}
