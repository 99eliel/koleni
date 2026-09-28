import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

function baseName(name) {
  return String(name || 'logo')
    .replace(/\.pdf$/i, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_');
}

async function renderPage(pdfDocument, file, pageNumber) {
  const page = await pdfDocument.getPage(pageNumber);
  const naturalViewport = page.getViewport({ scale: 1 });
  const longestSide = Math.max(naturalViewport.width, naturalViewport.height);
  const scale = Math.min(4, Math.max(2, 2200 / Math.max(longestSide, 1)));
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(viewport.width));
  canvas.height = Math.max(1, Math.ceil(viewport.height));
  const context = canvas.getContext('2d', { alpha: true });

  await page.render({
    canvasContext: context,
    viewport,
    background: 'rgba(0,0,0,0)',
  }).promise;

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((value) => {
      if (value) resolve(value);
      else reject(new Error('Não foi possível gerar a prévia do PDF.'));
    }, 'image/png', 0.96);
  });

  return new File(
    [blob],
    `${baseName(file.name)}-pagina-${pageNumber}-preview.png`,
    { type: 'image/png' },
  );
}

export async function renderPdfLogoPreview(file, pageNumber = 1) {
  if (!file) throw new Error('Selecione um PDF.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjsLib.getDocument({ data: bytes });
  const pdfDocument = await loadingTask.promise;

  if (pageNumber < 1 || pageNumber > pdfDocument.numPages) {
    await pdfDocument.destroy();
    throw new Error('Página do PDF inválida.');
  }

  const previewFile = await renderPage(pdfDocument, file, pageNumber);
  const pageCount = pdfDocument.numPages;
  await pdfDocument.destroy();

  return { previewFile, pageCount, pageNumber };
}

export async function renderPdfLogoPreviews(file) {
  if (!file) throw new Error('Selecione um PDF.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjsLib.getDocument({ data: bytes });
  const pdfDocument = await loadingTask.promise;
  const pageCount = pdfDocument.numPages;
  const pages = [];

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const previewFile = await renderPage(pdfDocument, file, pageNumber);
    pages.push({ previewFile, pageNumber });
  }

  await pdfDocument.destroy();

  return { pages, pageCount };
}
