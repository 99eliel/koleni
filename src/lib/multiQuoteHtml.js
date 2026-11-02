function quoteEscape(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function quoteMoney(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);
}

function quoteSafeImage(url) {
  if (!url || typeof url !== 'string') return '';
  try {
    const parsed = new URL(url, window.location.href);
    return ['https:', 'http:', 'blob:'].includes(parsed.protocol) ? quoteEscape(parsed.href) : '';
  } catch {
    return '';
  }
}

function quoteText(value) {
  return quoteEscape(value).replace(/\r?\n/g, '<br>');
}

function quoteArtViews(piece) {
  const labels = { front: 'Foto 1 · Frente', back: 'Foto 2 · Costas', combined: 'Foto 3 · Adicional', final: 'Arte final' };
  const photos = Object.entries(piece.finalImages || {})
    .filter(([, url]) => typeof url === 'string' && url.trim())
    .sort(([a], [b]) => ['front', 'back', 'combined'].indexOf(a) - ['front', 'back', 'combined'].indexOf(b))
    .map(([view, url]) => ({ label: labels[view] || view, url }));
  if (!photos.length && piece.finalImageUrl) photos.push({ label: 'Arte final', url: piece.finalImageUrl });
  return photos.slice(0, 3);
}

function quoteModelDetails(piece) {
  const logos = (piece.logos || []).map((logo) => {
    const filename = logo.sourceName || 'Logo aplicada';
    const view = { front: 'frente', back: 'costas', combined: 'foto adicional' }[logo.position?.view] || 'na peça';
    return `${filename} (${view})`;
  });
  const texts = (piece.texts || []).map((item) => {
    const str = String(item.text || '').trim();
    const view = { front: 'frente', back: 'costas', combined: 'foto adicional' }[item.position?.view] || 'na peça';
    return str ? `"${str}" (${view})` : '';
  }).filter(Boolean);
  return { logos: logos.slice(0, 8), texts: texts.slice(0, 8) };
}

function quoteColors(piece) {
  return Object.entries(piece.colorChoices || {}).slice(0, 12).map(([label, choice]) => {
    const value = typeof choice === 'string' ? choice : choice?.color;
    return {
      label: String(label).replace(/[_-]/g, ' ').trim() || 'Região',
      color: typeof value === 'string' && /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(value) ? value : '',
    };
  });
}

export function buildMultiPieceQuoteHtml({ order, lines, total, estimatedTime, notes, logoUrl }) {
  const date = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' }).format(new Date());
  const quantity = lines.reduce((acc, item) => acc + (Number(item.quantity) || 0), 0);
  const sections = lines.map((piece, index) => {
    const name = quoteEscape(piece.garmentName || piece.garmentId || `Modelo ${index + 1}`);
    const photos = quoteArtViews(piece);
    const photosHtml = photos.length
      ? `<div class="photos count-${photos.length}">${photos.map(({ url, label }) =>
        `<figure class="photo"><div class="picture"><img src="${quoteSafeImage(url)}" alt="${name} — ${quoteEscape(label)}" /></div><figcaption>${quoteEscape(label)}</figcaption></figure>`
      ).join('')}</div>`
      : '<div class="no-photo">Arte final não disponibilizada para este modelo.</div>';
    const sizes = Object.entries(piece.sizeGrid || {}).filter(([, n]) => Number(n) > 0);
    const sizesHtml = sizes.length ? sizes.map(([size, n]) => `<span class="size"><b>${quoteEscape(size)}</b> ${Number(n)} un.</span>`).join('') : '<span class="muted">Sem grade informada</span>';
    const details = quoteModelDetails(piece);
    const colors = quoteColors(piece);
    const colorsHtml = colors.length
      ? `<div class="colors">${colors.map(({ label, color }) => `<span class="color"><i style="background:${color || '#ededed'}"></i>${quoteEscape(label)}${color ? ` · ${quoteEscape(color)}` : ''}</span>`).join('')}</div>`
      : '';
    const applicationsHtml = [
      ...(details.logos.length ? [`<div><b>Logos aplicadas:</b> ${quoteEscape(details.logos.join(' · '))}</div>`] : []),
      ...(details.texts.length ? [`<div><b>Nomes / números / textos:</b> ${quoteEscape(details.texts.join(' · '))}</div>`] : []),
    ].join('');
    return `<section class="model">
      <div class="model-head"><div class="index">${String(index + 1).padStart(2, '0')}</div><div class="model-title"><small>PERSONALIZAÇÃO ${index + 1} DE ${lines.length}</small><h2>${name}</h2></div><div class="model-count">${Number(piece.quantity) || 0} peça(s)</div></div>
      ${photosHtml}
      <div class="model-content">
        <div class="model-subtitle">Especificações deste modelo</div>
        <div class="details"><div class="field"><b>Quantidade</b><span>${Number(piece.quantity) || 0} unidade(s)</span></div>
        <div class="field"><b>Grade de tamanhos</b><div class="sizes">${sizesHtml}</div></div></div>
        ${colorsHtml ? `<div class="spec"><b>Cores da peça</b>${colorsHtml}</div>` : ''}
        ${applicationsHtml ? `<div class="spec"><b>Elementos da arte</b><div class="details-text">${applicationsHtml}</div></div>` : ''}
        ${piece.description ? `<div class="spec description"><b>Descrição / acabamento deste modelo</b><div>${quoteText(piece.description)}</div></div>` : ''}
        <div class="model-finance"><div><span>Preço unitário</span><strong>${quoteMoney(piece.unitPrice)}</strong></div><div><span>Quantidade</span><strong>${piece.quantity}</strong></div><div class="subtotal"><span>Subtotal deste modelo</span><strong>${quoteMoney(piece.total)}</strong></div></div>
      </div>
    </section>`;
  }).join('');
  const summaryRows = lines.map((item, index) =>
    `<tr><td>${index + 1}. ${quoteEscape(item.garmentName || `Modelo ${index + 1}`)}</td><td class="num">${item.quantity}</td><td class="num">${quoteMoney(item.unitPrice)}</td><td class="num"><strong>${quoteMoney(item.total)}</strong></td></tr>`
  ).join('');
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Koleni — Orçamento ${quoteEscape(order.displayCode || order.id)}</title>
<style>
@page{size:A4;margin:13mm}
*{box-sizing:border-box}
body{margin:0;background:#efefef;font:12px/1.44 Arial,Helvetica,sans-serif;color:#282828;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.sheet{max-width:900px;margin:0 auto;padding:20px;background:#fff;box-shadow:0 12px 50px #0001}
.brand{display:flex;align-items:center;justify-content:space-between;padding:12px 20px;background:#191919;border-radius:12px;gap:15px}
.brand-box{background:#fff;border-radius:7px;padding:6px 12px;width:235px;min-height:60px;display:flex;align-items:center}
.brand img{width:100%;max-height:65px;object-fit:contain}
.brand-tag{color:#f4f4f4;letter-spacing:.12em;font-size:10px;font-weight:bold;text-align:right}
.header{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;padding:20px 0 15px;border-bottom:3px solid #e33336}
.header h1{font-size:26px;line-height:1;margin:0 0 7px}.header p{color:#666;margin:0}
.header-code{text-align:right;font-size:12px}.header-code strong{font-size:16px;display:block;color:#c92a2d}.header-code small{color:#666}
.customer-grid{display:grid;grid-template-columns:1.3fr 1fr 1fr;gap:9px;margin:16px 0}
.customer{padding:10px 12px;background:#f7f7f7;border:1px solid #ddd;border-radius:9px;min-width:0;overflow-wrap:anywhere}
.customer span{display:block;font-size:9px;letter-spacing:.06em;text-transform:uppercase;color:#666;font-weight:bold}
.customer strong{display:block;margin-top:5px;font-size:12px}
.model{border:1px solid #dcdcdc;border-radius:12px;overflow:hidden;margin:14px 0 18px;break-inside:avoid;page-break-inside:avoid;background:#fff}
.model-head{display:flex;align-items:center;gap:12px;padding:11px 14px;background:#292929;color:#fff}
.index{width:33px;height:33px;flex:0 0 33px;background:#e33336;border-radius:8px;display:grid;place-items:center;font-size:17px;font-weight:800}
.model-title{flex:1;min-width:0}.model-title small{font-size:9px;color:#e7a7a9;letter-spacing:.07em;font-weight:700}
.model-title h2{font-size:15px;margin:2px 0;overflow-wrap:anywhere}.model-count{font-size:11px;font-weight:bold;white-space:nowrap}
.photos{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;padding:12px;background:#f9f9f9}
.photos.count-1{grid-template-columns:minmax(0,1fr)}.photos.count-3{grid-template-columns:repeat(3,minmax(0,1fr))}
.photo{margin:0;background:#fff;border:1px solid #e4e4e4;border-radius:8px;overflow:hidden;text-align:center;min-width:0}
.picture{height:155px;display:flex;align-items:center;justify-content:center;padding:4px}
.picture img{max-height:100%;max-width:100%;width:auto;height:auto;object-fit:contain}
.photo figcaption{background:#f5f5f5;border-top:1px solid #e7e7e7;color:#646464;padding:5px;font-size:10px}
.no-photo{padding:30px;text-align:center;background:#f7f7f7;color:#666}
.model-content{padding:12px 14px}
.model-subtitle{font-size:11px;font-weight:800;margin-bottom:9px;text-transform:uppercase;letter-spacing:.04em}
.details{display:grid;grid-template-columns:minmax(0,170px) minmax(0,1fr);gap:10px;margin-bottom:9px}
.field{background:#fafafa;border:1px solid #e4e4e4;border-radius:8px;padding:7px 9px;min-width:0}
.field>b{display:block;font-size:9px;text-transform:uppercase;letter-spacing:.04em;color:#666;margin-bottom:5px}
.field>span{font-weight:bold}.sizes{display:flex;flex-wrap:wrap;gap:5px;align-items:center}
.size{background:#fff;border:1px solid #ddd;border-radius:5px;padding:3px 6px;font-size:10px}
.spec{margin-top:7px;padding:8px 9px;border:1px solid #e5e5e5;border-radius:8px;font-size:10.5px;overflow-wrap:anywhere}
.spec>b{display:block;margin-bottom:4px;color:#333;font-size:10px}
.colors{display:flex;flex-wrap:wrap;gap:6px}.color{display:inline-flex;align-items:center;gap:5px;color:#555;border:1px solid #e5e5e5;border-radius:6px;padding:3px 6px}
.color i{width:13px;height:13px;border-radius:4px;border:1px solid #bbb;display:inline-block}
.details-text>div{margin-top:2px}.description{background:#fffafa}
.model-finance{display:grid;grid-template-columns:1fr 1fr 1.4fr;gap:10px;margin-top:12px;padding-top:10px;border-top:1px solid #ddd}
.model-finance>div{display:flex;flex-direction:column;gap:3px}.model-finance span{font-size:10px;color:#777}.model-finance strong{font-size:13px}
.model-finance .subtotal{border-radius:8px;background:#fff0f0;padding:7px 9px;margin-top:-7px}
.model-finance .subtotal strong{font-size:17px;color:#c92a2d}
.summary{border:1px solid #dcdcdc;border-radius:10px;overflow:hidden;break-inside:avoid;page-break-inside:avoid;margin-top:16px}
.summary-title{padding:10px 12px;background:#292929;color:white;font-size:14px;font-weight:800}
.summary table{border-collapse:collapse;width:100%}.summary th{text-align:left;color:#666;text-transform:uppercase;letter-spacing:.05em;background:#f2f2f2;font-size:9px}
.summary th,.summary td{padding:9px 11px;border-bottom:1px solid #e5e5e5}
.num{text-align:right;white-space:nowrap}.summary tfoot td{background:#fff0f0;color:#c92a2d;font-weight:800;font-size:15px}
.conditions{display:grid;grid-template-columns:1fr;gap:8px;margin-top:14px}.conditions>div{padding:11px 12px;background:#f7f7f7;border:1px solid #ddd;border-radius:8px;overflow-wrap:anywhere}
.conditions strong{display:block;margin-bottom:3px;font-size:11px}.conditions p{margin:0;color:#555;white-space:normal}
.footer{margin:24px 0 0;text-align:center;color:#777;padding-top:10px;border-top:1px solid #ddd;font-size:10px}
.tools{position:fixed;right:16px;bottom:16px;z-index:4;display:flex;align-items:center;gap:8px}
.tools button{border:0;border-radius:8px;padding:12px 18px;cursor:pointer;background:#e33336;color:white;font-weight:bold;box-shadow:0 5px 18px #0002}
.tools small{background:#fff;padding:6px 10px;border-radius:6px}
.muted{color:#888}
@media screen and (max-width:600px){.sheet{padding:12px}.brand{padding:10px}.brand-box{width:175px}.header h1{font-size:23px}.customer-grid{grid-template-columns:1fr 1fr}.model-finance{grid-template-columns:1fr 1fr}.model-finance .subtotal{grid-column:1/-1}.photos.count-3{grid-template-columns:1fr 1fr}.details{grid-template-columns:1fr}.brand-tag{font-size:8px}.tools{right:6px;bottom:6px}}
@media print{body{background:#fff}.sheet{box-shadow:none;padding:0;max-width:none}.tools{display:none}.model{box-shadow:none}.brand,.model-head,.summary-title,.model-finance .subtotal{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body>
<div class="sheet">
<header class="brand"><div class="brand-box"><img src="${quoteSafeImage(logoUrl)}" alt="Koleni Uniformes"></div><div class="brand-tag">UNIFORMES PERSONALIZADOS<br>PROPOSTA COMERCIAL</div></header>
<div class="header"><div><h1>Orçamento</h1><p>${lines.length} modelos personalizados · ${quantity} peças no total</p></div>
<div class="header-code">Pedido <strong>${quoteEscape(order.displayCode || order.id)}</strong><small>${date}</small></div></div>
<div class="customer-grid"><div class="customer"><span>Cliente / empresa</span><strong>${quoteEscape(order.customerName || 'Não informado')}</strong></div>
<div class="customer"><span>WhatsApp</span><strong>${quoteEscape(order.whatsapp || 'Não informado')}</strong></div>
<div class="customer"><span>Responsável pelo atendimento</span><strong>${quoteEscape(order.sellerEmail || 'Equipe Koleni')}</strong></div></div>
${sections}
<section class="summary"><div class="summary-title">Resumo dos valores</div><table><thead><tr><th>Modelo</th><th class="num">Qtd.</th><th class="num">Unitário</th><th class="num">Subtotal</th></tr></thead><tbody>${summaryRows}</tbody>
<tfoot><tr><td>Total geral</td><td class="num">${quantity}</td><td></td><td class="num">${quoteMoney(total)}</td></tr></tfoot></table></section>
<div class="conditions"><div><strong>Prazo estimado de entrega</strong><p>${quoteEscape(estimatedTime)}</p></div>
${notes ? `<div><strong>Condições e observações gerais</strong><p>${quoteText(notes)}</p></div>` : ''}</div>
<div class="footer">Koleni Uniformes • Proposta referente às artes e quantidades descritas acima.</div>
</div>
<div class="tools"><small>Confira as fotos antes de salvar</small><button type="button" onclick="window.print()">Imprimir / Salvar PDF</button></div>
<script>
window.addEventListener('load', function () {
  var images = Array.from(document.images);
  var ready = Promise.all(images.map(function (img) {
    if (img.complete) return Promise.resolve();
    return new Promise(function (resolve) {
      img.addEventListener('load', resolve, { once: true });
      img.addEventListener('error', resolve, { once: true });
    });
  }));
  Promise.race([ready, new Promise(function (resolve) { setTimeout(resolve, 6500); })])
    .then(function () { setTimeout(function () { window.print(); }, 200); });
});
</script></body></html>`;
}
