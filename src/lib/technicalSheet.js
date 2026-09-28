import QRCode from 'qrcode';
import { getSizeScaleLabel } from './sizeScales';

const VIEW_LABELS = {
  front: 'Frente',
  back: 'Costas',
  combined: 'Frente + Costas',
};

const STATUS_LABELS = {
  pending: 'Aguardando atendimento',
  quoted: 'Orçamento gerado',
  approval: 'Aguardando aprovação',
  approved: 'Aprovado',
  production: 'Em produção',
  quality: 'Conferência',
  ready: 'Pronto',
  completed: 'Concluído',
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function rowsFromMap(map = {}) {
  return Object.entries(map).filter(([, value]) => value !== null && value !== undefined && value !== '');
}

function sizeGridHtml(sizeGrid = {}) {
  const rows = Object.entries(sizeGrid).filter(([, quantity]) => Number(quantity) > 0);
  if (!rows.length) return '<span class="muted">Sem grade detalhada</span>';
  return `<div class="size-grid">${rows.map(([size, quantity]) => `<div><span>${escapeHtml(size)}</span><strong>${Number(quantity)}</strong></div>`).join('')}</div>`;
}

function logosHtml(logos = []) {
  if (!logos.length) return '<p class="muted">Sem aplicação de logo.</p>';
  return logos.map((logo, index) => `
    <div class="logo-row">
      <div class="logo-index">${index + 1}</div>
      <div>
        <strong>${escapeHtml(logo.sourceName || `Logo ${index + 1}`)}</strong>
        <span>${escapeHtml(logo.placementLabel || 'Posição livre')} · ${logo.widthCm ? `${Number(logo.widthCm)} cm` : 'medida não informada'} · ${escapeHtml(VIEW_LABELS[logo.position?.view] || logo.position?.view || '')}</span>
        <small>${logo.sourceType === 'pdf' ? `PDF vetorial${logo.sourcePage ? ` · pág. ${logo.sourcePage}` : ''}` : (logo.backgroundRemoved ? 'Imagem tratada sem fundo' : 'Imagem')}</small>
      </div>
    </div>
  `).join('');
}

export async function openTechnicalSheet(order) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) throw new Error('O navegador bloqueou a abertura da ficha técnica.');

  const displayCode = order.displayCode || order.id;
  const qrData = `MARTINPEL|PEDIDO|${displayCode}|VERSAO|${order.designVersion || 1}`;
  const qrUrl = await QRCode.toDataURL(qrData, { width: 220, margin: 1, errorCorrectionLevel: 'M' });
  const images = Object.entries(order.finalImages ?? {}).filter(([, url]) => Boolean(url));
  if (!images.length && order.finalImageUrl) images.push(['final', order.finalImageUrl]);
  const colors = rowsFromMap(order.colorChoices);
  const sizeScaleLabel = getSizeScaleLabel(order.sizeScale);

  printWindow.document.open();
  printWindow.document.write(`<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>Ficha Técnica · ${escapeHtml(displayCode)}</title>
<style>
  *{box-sizing:border-box}body{margin:0;background:#eef3f7;color:#10223a;font-family:Arial,sans-serif}.sheet{width:min(1100px,100%);margin:24px auto;background:#fff;border:1px solid #d9e4ef;box-shadow:0 16px 40px rgba(6,43,82,.12)}.head{display:grid;grid-template-columns:1fr auto;gap:24px;padding:24px 28px;background:linear-gradient(135deg,#062b52,#0b4f83);color:#fff}.head h1{margin:4px 0 6px;font-size:28px}.head p{margin:0;color:#c7dce9}.qr{width:112px;height:112px;background:#fff;padding:6px;border-radius:10px}.content{padding:24px 28px}.meta{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px}.box{padding:12px;border:1px solid #dce6ee;border-radius:10px;background:#f8fbfd}.box span,.section-title{display:block;color:#6a7e90;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.08em}.box strong{display:block;margin-top:5px;font-size:14px}.section{margin-top:20px}.section-title{margin-bottom:9px;color:#1d6fae}.images{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}.image{padding:10px;border:1px solid #dce6ee;border-radius:12px;background:#f5f8fb;text-align:center}.image img{width:100%;height:260px;object-fit:contain;background:#fff}.image span{display:block;margin-top:7px;font-size:12px;font-weight:800}.colors{display:flex;flex-wrap:wrap;gap:8px}.color{display:flex;align-items:center;gap:7px;padding:8px 10px;border:1px solid #dce6ee;border-radius:9px}.swatch{width:18px;height:18px;border-radius:5px;border:1px solid rgba(0,0,0,.15)}.color span{font-size:12px}.logo-row{display:grid;grid-template-columns:34px 1fr;gap:10px;padding:10px 0;border-bottom:1px solid #e8eef3}.logo-index{width:28px;height:28px;display:grid;place-items:center;border-radius:8px;background:#eaf4fc;color:#0d5d92;font-weight:900}.logo-row div:last-child{display:flex;flex-direction:column;gap:3px}.logo-row strong{font-size:13px}.logo-row span,.logo-row small{font-size:11px;color:#607487}.size-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(68px,1fr));gap:7px}.size-grid>div{padding:9px;border:1px solid #dce6ee;border-radius:9px;text-align:center}.size-grid span{display:block;color:#6b7e90;font-size:10px;font-weight:800}.size-grid strong{display:block;margin-top:3px}.checklist{display:grid;grid-template-columns:repeat(5,1fr);gap:7px}.check{padding:9px;border-radius:9px;border:1px solid #dce6ee;font-size:11px}.check.ok{background:#effaf4;border-color:#bfe2cd}.muted{color:#738699;font-size:12px}.footer{display:flex;justify-content:space-between;gap:12px;margin-top:26px;padding-top:15px;border-top:1px solid #e2eaf0;color:#728596;font-size:10px}@media print{body{background:#fff}.sheet{margin:0;border:0;box-shadow:none}.no-print{display:none!important}}@media(max-width:800px){.meta{grid-template-columns:1fr 1fr}.checklist{grid-template-columns:1fr 1fr}}
</style>
</head>
<body>
<div class="sheet">
  <div class="head">
    <div><span>Martinpel · Gestão de Personalização</span><h1>Ficha Técnica de Produção</h1><p>Pedido ${escapeHtml(displayCode)} · versão ${Number(order.designVersion) || 1}</p></div>
    <img class="qr" src="${qrUrl}" alt="QR do pedido" />
  </div>
  <div class="content">
    <div class="meta">
      <div class="box"><span>Cliente</span><strong>${escapeHtml(order.customerName || 'Não informado')}</strong></div>
      <div class="box"><span>WhatsApp</span><strong>${escapeHtml(order.whatsapp || 'Não informado')}</strong></div>
      <div class="box"><span>Peça</span><strong>${escapeHtml(order.garmentName || order.garmentId || 'Não identificada')}</strong></div>
      <div class="box"><span>Status</span><strong>${escapeHtml(STATUS_LABELS[order.status] || order.status || 'Pendente')}</strong></div>
      <div class="box"><span>Quantidade</span><strong>${Number(order.quantity) || 0}</strong></div>
      <div class="box"><span>Vendedor</span><strong>${escapeHtml(order.sellerEmail || 'Não identificado')}</strong></div>
      <div class="box"><span>Versão</span><strong>V${Number(order.designVersion) || 1}</strong></div>
      <div class="box"><span>Prazo</span><strong>${escapeHtml(order.quote?.estimatedTime || 'Não informado')}</strong></div>
    </div>

    <div class="section"><div class="section-title">Grade de tamanhos · ${escapeHtml(sizeScaleLabel)}</div>${sizeGridHtml(order.sizeGrid)}</div>
    <div class="section"><div class="section-title">Cores definidas</div><div class="colors">${colors.map(([id, color]) => `<div class="color"><i class="swatch" style="background:${escapeHtml(color)}"></i><span>${escapeHtml(id)} · ${escapeHtml(color)}</span></div>`).join('') || '<span class="muted">Sem cores registradas.</span>'}</div></div>
    <div class="section"><div class="section-title">Aplicações / logos</div>${logosHtml(order.logos)}</div>
    <div class="section"><div class="section-title">Arte aprovada para conferência</div><div class="images">${images.map(([view, url]) => `<div class="image"><img src="${escapeHtml(url)}" alt="${escapeHtml(view)}"/><span>${escapeHtml(VIEW_LABELS[view] || 'Arte final')}</span></div>`).join('') || '<span class="muted">Sem arte final anexada.</span>'}</div></div>

    <div class="section"><div class="section-title">Checklist de produção</div><div class="checklist">
      ${[
        ['garmentChecked','Peça'],['colorsChecked','Cores'],['logosChecked','Logos'],['sizesChecked','Grade'],['finalChecked','Conferência final'],
      ].map(([key,label]) => `<div class="check ${order.productionChecklist?.[key] ? 'ok' : ''}">${order.productionChecklist?.[key] ? '✓' : '○'} ${label}</div>`).join('')}
    </div></div>

    <div class="footer"><span>Gerado localmente pelo sistema Martinpel — nenhum PDF adicional foi salvo no Firebase.</span><span>${new Date().toLocaleString('pt-BR')}</span></div>
  </div>
</div>
<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),300));</script>
</body></html>`);
  printWindow.document.close();
}
