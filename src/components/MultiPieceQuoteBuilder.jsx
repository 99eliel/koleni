import { useState } from 'react';
import { MARTINPEL_LOGO_DATA_URL } from '../lib/martinpelLogo';
import { saveOrderQuote } from '../lib/orderRepo';
import OrderOperationsPanel from './OrderOperationsPanel';

const money = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0);
const esc = (v) => String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');

export default function MultiPieceQuoteBuilder({ order, disabled, onSaved }) {
  const items = order.items || [];
  const [open, setOpen] = useState(Boolean(order.quote));
  const [prices, setPrices] = useState(() => items.map((item, index) => String(order.quote?.items?.[index]?.unitPrice ?? '')));
  const [estimatedTime, setEstimatedTime] = useState(order.quote?.estimatedTime || '');
  const [notes, setNotes] = useState(order.quote?.notes || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lines = items.map((item, index) => ({
    ...item,
    unitPrice: Number(String(prices[index] || '').replace(',', '.')) || 0,
    quantity: Number(item.quantity) || 0,
  })).map((item) => ({ ...item, total: Math.round(item.unitPrice * item.quantity * 100) / 100 }));
  const total = Math.round(lines.reduce((sum, item) => sum + item.total, 0) * 100) / 100;

  async function generateQuote() {
    if (lines.some((item) => item.unitPrice <= 0)) return setError('Informe o valor unitário de cada modelo.');
    if (!estimatedTime.trim()) return setError('Informe o prazo estimado.');
    const printWindow = window.open('', '_blank');
    if (!printWindow) return setError('O navegador bloqueou o PDF. Permita abrir novas janelas.');
    setBusy(true);
    setError('');
    try {
      await saveOrderQuote(order.id, {
        items: lines.map((item) => ({ id: item.id || '', garmentId: item.garmentId, garmentName: item.garmentName, quantity: item.quantity, unitPrice: item.unitPrice, total: item.total })),
        total,
        estimatedTime: estimatedTime.trim(),
        notes: notes.trim(),
      });
      const rows = lines.map((item, index) => {
        const image = item.finalImageUrl || Object.values(item.finalImages || {}).find(Boolean) || '';
        return `<tr><td><div class="product">${image ? `<img src="${esc(image)}" alt="Arte do modelo">` : ''}<div><strong>${index + 1}. ${esc(item.garmentName)}</strong><small>${esc(Object.entries(item.sizeGrid || {}).filter(([,qty]) => Number(qty) > 0).map(([size,qty]) => `${size}: ${qty}`).join(' · '))}</small></div></div></td><td class="num">${item.quantity}</td><td class="num">${money(item.unitPrice)}</td><td class="num"><b>${money(item.total)}</b></td></tr>`;
      }).join('');
      const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Orçamento Koleni — ${esc(order.displayCode || order.id)}</title>
        <style>@page{size:A4;margin:14mm}*{box-sizing:border-box}body{font:13px Arial,sans-serif;color:#242424;margin:0;background:#fff}.sheet{max-width:900px;margin:auto}.brand{background:#141414;text-align:center;padding:12px;border-radius:9px}.brand img{height:70px;max-width:100%;object-fit:contain;background:#fff;border-radius:5px;padding:6px}.head{display:flex;align-items:center;justify-content:space-between;margin:20px 0 16px}.head h1{font-size:25px;margin:0}.head small{display:block;color:#555}.meta{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:18px}.meta div{border:1px solid #ddd;border-radius:7px;padding:10px}.meta small{display:block;color:#555;margin-bottom:5px}table{width:100%;border-collapse:collapse}th{text-align:left;color:#fff;background:#333;padding:12px}td{border-bottom:1px solid #ddd;padding:10px 8px;vertical-align:middle}.num{text-align:right;white-space:nowrap}.product{display:flex;align-items:center;gap:10px}.product img{width:65px;height:70px;object-fit:contain;background:#f3f3f3}.product strong{display:block}.product small{display:block;color:#555;font-size:10px;margin-top:4px}.total{text-align:right;font-size:20px;font-weight:800;padding:15px 2px;color:#c92a2d}.extra{padding:12px;border:1px solid #ddd;border-radius:8px;margin-top:12px}.footer{text-align:center;color:#666;font-size:11px;margin:30px auto 0;border-top:1px solid #ddd;padding-top:12px}.print{position:fixed;bottom:15px;right:20px;padding:10px 16px;background:#e33336;border:0;border-radius:7px;color:#fff}@media print{.print{display:none}.brand,th{print-color-adjust:exact;-webkit-print-color-adjust:exact}}@media(max-width:600px){.meta{grid-template-columns:1fr}.product{flex-direction:column;text-align:left}.product img{width:50px}}</style></head>
        <body><div class="sheet"><div class="brand"><img src="${esc(MARTINPEL_LOGO_DATA_URL)}" alt="Koleni"></div>
        <div class="head"><div><h1>Orçamento</h1><small>Personalizações de uniformes</small></div><div><strong>Pedido ${esc(order.displayCode || order.id)}</strong><small>${new Date().toLocaleDateString('pt-BR')}</small></div></div>
        <div class="meta"><div><small>Cliente</small><strong>${esc(order.customerName || 'Não informado')}</strong></div><div><small>WhatsApp</small><strong>${esc(order.whatsapp || 'Não informado')}</strong></div></div>
        <table><thead><tr><th>Modelo / Arte</th><th class="num">Qtd.</th><th class="num">Unitário</th><th class="num">Subtotal</th></tr></thead><tbody>${rows}</tbody></table>
        <div class="total">Total do pedido: ${money(total)}</div>
        <div class="extra"><strong>Prazo:</strong> ${esc(estimatedTime.trim())}</div>
        ${notes.trim() ? `<div class="extra"><strong>Observações:</strong> ${esc(notes.trim())}</div>` : ''}
        <div class="footer">Koleni Uniformes — orçamento completo com ${lines.length} modelos e ${lines.reduce((sum,item) => sum + item.quantity,0)} peças.</div>
        </div><button class="print" onclick="window.print()">Imprimir / Salvar PDF</button></body></html>`;
      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
      await onSaved?.();
    } catch (err) {
      printWindow.close();
      setError(err.message || 'Não foi possível criar o orçamento.');
    } finally {
      setBusy(false);
    }
  }

  return <div className="multi-quote">
    <button className="button button-secondary order-quote-toggle" type="button" disabled={disabled || busy} onClick={() => setOpen((v) => !v)}>{open ? 'Fechar orçamento' : 'Orçamento por modelo'}</button>
    {open && <div className="order-quote-form">
      <strong>Preços por modelo</strong>
      {lines.map((item, index) => <div className="multi-quote-row" key={item.id || index}>
        <div><strong>{index + 1}. {item.garmentName}</strong><small>{item.quantity} unidade(s)</small></div>
        <label>Preço unitário (R$)<input type="number" min="0.01" step="0.01" required value={prices[index] || ''} onChange={(e) => setPrices((p) => p.map((v, i) => i === index ? e.target.value : v))} placeholder="Ex.: 89,90" /></label>
        <strong>{money(item.total)}</strong>
      </div>)}
      <label>Prazo estimado<input value={estimatedTime} onChange={(e) => setEstimatedTime(e.target.value)} placeholder="Ex.: 15 dias úteis" /></label>
      <label>Observações<textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
      <div className="order-quote-total"><span>Valor total do pedido</span><strong>{money(total)}</strong></div>
      {error && <div className="order-quote-error">{error}</div>}
      <button className="button button-primary" type="button" disabled={busy || disabled} onClick={generateQuote}>{busy ? 'Gerando…' : 'Gerar orçamento completo / PDF'}</button>
    </div>}
    <OrderOperationsPanel order={order} disabled={disabled || busy} onSaved={onSaved} />
  </div>;
}
