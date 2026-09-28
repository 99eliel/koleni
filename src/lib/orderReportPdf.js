import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import { getSizeScaleLabel } from './sizeScales';

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

const VIEW_LABELS = {
  front: 'Frente',
  back: 'Costas',
  combined: 'Frente + Costas',
  final: 'Arte final',
};

const CHECKS = [
  ['garmentChecked', 'Peça correta'],
  ['colorsChecked', 'Cores conferidas'],
  ['logosChecked', 'Logos e posições'],
  ['sizesChecked', 'Grade conferida'],
  ['finalChecked', 'Conferência final'],
];

function safeFileName(value) {
  return String(value || 'pedido')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'pedido';
}

function text(value) {
  return String(value ?? '').trim();
}

async function urlToDataUrl(url) {
  const response = await fetch(url, { mode: 'cors', cache: 'no-store' });
  if (!response.ok) throw new Error(`Falha ao carregar imagem (${response.status}).`);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Falha ao converter imagem para o relatório.'));
    reader.readAsDataURL(blob);
  });
}

function imageFormat(dataUrl = '') {
  if (dataUrl.startsWith('data:image/jpeg')) return 'JPEG';
  if (dataUrl.startsWith('data:image/webp')) return 'WEBP';
  return 'PNG';
}

function fitImage(pdf, dataUrl, x, y, maxW, maxH) {
  const props = pdf.getImageProperties(dataUrl);
  const ratio = Math.min(maxW / props.width, maxH / props.height);
  const width = props.width * ratio;
  const height = props.height * ratio;
  const offsetX = x + (maxW - width) / 2;
  const offsetY = y + (maxH - height) / 2;
  pdf.addImage(dataUrl, imageFormat(dataUrl), offsetX, offsetY, width, height, undefined, 'FAST');
}

function drawHeader(pdf, displayCode, version) {
  pdf.setFillColor(5, 5, 5);
  pdf.rect(0, 0, 210, 34, 'F');
  pdf.setFillColor(239, 27, 37);
  pdf.rect(0, 34, 210, 3.2, 'F');

  pdf.setTextColor(239, 49, 59);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(22);
  pdf.text('koleni', 15, 15);

  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'normal');
  pdf.text('uniformes', 15.5, 21);

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(13);
  pdf.text('Relatório do Pedido', 76, 14);
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'normal');
  pdf.text(`${displayCode}  •  versão ${version}`, 76, 21);
}

function drawMetaBox(pdf, label, value, x, y, w) {
  pdf.setFillColor(246, 247, 248);
  pdf.setDrawColor(224, 226, 229);
  pdf.roundedRect(x, y, w, 18, 2, 2, 'FD');
  pdf.setTextColor(108, 108, 108);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7);
  pdf.text(label.toUpperCase(), x + 4, y + 5.5);
  pdf.setTextColor(20, 20, 20);
  pdf.setFontSize(10);
  const lines = pdf.splitTextToSize(text(value) || '—', w - 8);
  pdf.text(lines.slice(0, 2), x + 4, y + 11.5);
}

function drawSectionTitle(pdf, title, y) {
  pdf.setTextColor(239, 27, 37);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  pdf.text(title.toUpperCase(), 15, y);
  pdf.setDrawColor(239, 27, 37);
  pdf.line(15, y + 2.5, 195, y + 2.5);
}

function ensureSpace(pdf, y, needed) {
  if (y + needed <= 282) return y;
  pdf.addPage();
  return 18;
}

export async function generateOrderReportPdf(order) {
  const displayCode = order.displayCode || order.id || 'PEDIDO';
  const version = Number(order.designVersion) || 1;
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });

  drawHeader(pdf, displayCode, version);

  const qrPayload = `KOLENI|PEDIDO|${displayCode}|VERSAO|${version}`;
  const qrDataUrl = await QRCode.toDataURL(qrPayload, { width: 240, margin: 1, errorCorrectionLevel: 'M' });
  pdf.addImage(qrDataUrl, 'PNG', 171, 6, 26, 26);

  let y = 45;
  const boxW = 56.5;
  drawMetaBox(pdf, 'Cliente', order.customerName, 15, y, boxW);
  drawMetaBox(pdf, 'WhatsApp', order.whatsapp, 76.75, y, boxW);
  drawMetaBox(pdf, 'Quantidade', Number(order.quantity) || 0, 138.5, y, boxW);
  y += 23;
  drawMetaBox(pdf, 'Peça', order.garmentName || order.garmentId, 15, y, boxW);
  drawMetaBox(pdf, 'Vendedor', order.sellerEmail, 76.75, y, boxW);
  drawMetaBox(pdf, 'Status', STATUS_LABELS[order.status] || order.status || 'Pendente', 138.5, y, boxW);
  y += 27;

  drawSectionTitle(pdf, `Grade de produção · ${getSizeScaleLabel(order.sizeScale)}`, y);
  y += 8;
  const sizes = Object.entries(order.sizeGrid || {}).filter(([, quantity]) => Number(quantity) > 0);
  if (sizes.length) {
    let x = 15;
    sizes.forEach(([size, quantity]) => {
      pdf.setFillColor(247, 247, 247);
      pdf.setDrawColor(224, 224, 224);
      pdf.roundedRect(x, y, 22, 15, 2, 2, 'FD');
      pdf.setTextColor(100, 100, 100);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7);
      pdf.text(size, x + 11, y + 5, { align: 'center' });
      pdf.setTextColor(20, 20, 20);
      pdf.setFontSize(10);
      pdf.text(String(quantity), x + 11, y + 11.5, { align: 'center' });
      x += 25;
    });
    y += 20;
  } else {
    pdf.setTextColor(110, 110, 110);
    pdf.setFontSize(9);
    pdf.text('Sem grade detalhada.', 15, y);
    y += 8;
  }

  y = ensureSpace(pdf, y, 48);
  drawSectionTitle(pdf, 'Checklist de conferência', y);
  y += 8;
  CHECKS.forEach(([key, label], index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x = 15 + col * 91;
    const yy = y + row * 12;
    const checked = Boolean(order.productionChecklist?.[key]);
    pdf.setFillColor(checked ? 236 : 248, checked ? 249 : 248, checked ? 241 : 248);
    pdf.setDrawColor(checked ? 171 : 225, checked ? 220 : 225, checked ? 189 : 225);
    pdf.roundedRect(x, yy, 86, 9, 2, 2, 'FD');
    pdf.setTextColor(checked ? 24 : 120, checked ? 120 : 120, checked ? 70 : 120);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.text(`${checked ? '✓' : '○'} ${label}`, x + 4, yy + 6);
  });
  y += 39;

  const colors = Object.entries(order.colorChoices || {});
  if (colors.length) {
    y = ensureSpace(pdf, y, 35);
    drawSectionTitle(pdf, 'Cores definidas', y);
    y += 8;
    colors.forEach(([region, color], index) => {
      const col = index % 3;
      const row = Math.floor(index / 3);
      const x = 15 + col * 60;
      const yy = y + row * 10;
      pdf.setFillColor(248, 248, 248);
      pdf.setDrawColor(225, 225, 225);
      pdf.roundedRect(x, yy, 55, 8, 1.5, 1.5, 'FD');
      pdf.setTextColor(50, 50, 50);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7.5);
      pdf.text(pdf.splitTextToSize(`${region}: ${color}`, 49)[0], x + 3, yy + 5.3);
    });
    y += Math.ceil(colors.length / 3) * 10 + 4;
  }

  if (order.logos?.length) {
    y = ensureSpace(pdf, y, 18 + order.logos.length * 11);
    drawSectionTitle(pdf, 'Aplicações / logos', y);
    y += 8;
    order.logos.forEach((logo, index) => {
      const line = `${index + 1}. ${logo.sourceName || 'Logo'} · ${logo.placementLabel || 'Livre'} · ${logo.widthCm ? `${logo.widthCm} cm` : 'sem medida'} · ${VIEW_LABELS[logo.position?.view] || logo.position?.view || ''}`;
      pdf.setTextColor(40, 40, 40);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.text(pdf.splitTextToSize(line, 175), 15, y);
      y += 10;
    });
  }

  const images = Object.entries(order.finalImages || {}).filter(([, url]) => Boolean(url));
  if (!images.length && order.finalImageUrl) images.push(['final', order.finalImageUrl]);

  if (images.length) {
    pdf.addPage();
    drawSectionTitle(pdf, 'Arte final do pedido', 18);
    let imageY = 27;
    for (const [view, url] of images) {
      try {
        const dataUrl = await urlToDataUrl(url);
        pdf.setFillColor(248, 248, 248);
        pdf.setDrawColor(225, 225, 225);
        pdf.roundedRect(15, imageY, 180, 92, 2, 2, 'FD');
        fitImage(pdf, dataUrl, 18, imageY + 4, 174, 78);
        pdf.setTextColor(25, 25, 25);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(9);
        pdf.text(VIEW_LABELS[view] || 'Arte final', 105, imageY + 88, { align: 'center' });
        imageY += 100;
        if (imageY > 205 && [view, url] !== images[images.length - 1]) {
          pdf.addPage();
          imageY = 18;
        }
      } catch {
        pdf.setTextColor(160, 40, 40);
        pdf.setFontSize(9);
        pdf.text(`Não foi possível carregar a imagem: ${VIEW_LABELS[view] || view}`, 15, imageY + 8);
        imageY += 16;
      }
    }
  }

  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    pdf.setPage(page);
    pdf.setDrawColor(235, 235, 235);
    pdf.line(15, 287, 195, 287);
    pdf.setTextColor(135, 135, 135);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    pdf.text(`Koleni Uniformes · Pedido ${displayCode}`, 15, 292);
    pdf.text(`${page}/${pages} · ${new Date().toLocaleString('pt-BR')}`, 195, 292, { align: 'right' });
  }

  pdf.save(`relatorio-${safeFileName(displayCode)}.pdf`);
}
