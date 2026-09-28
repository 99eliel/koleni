import { useRef, useState } from 'react';
import BackgroundRemovalDialog from './BackgroundRemovalDialog';
import CustomerStage from './CustomerStage';
import PdfLogoLibrary from './PdfLogoLibrary';
import { renderPdfLogoPreviews } from '../lib/pdfLogoPreview';

const MAX_LOGO_BYTES = 5 * 1024 * 1024;
const MAX_PDF_BYTES = 15 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!ALLOWED_TYPES.has(file.type)) {
      reject(new Error('Use uma logo PNG, JPG ou WebP.'));
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      reject(new Error('A logo de teste deve ter no máximo 5 MB.'));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Não foi possível ler a logo selecionada.'));
    reader.readAsDataURL(file);
  });
}

export default function AdminLogoTester({
  garment,
  view,
  colorChoices,
  zoom,
  setZoom,
  onRegionClick,
}) {
  const stageRef = useRef(null);
  const fileInputRef = useRef(null);
  const scrollRef = useRef(null);
  const panRef = useRef(null);
  const [logos, setLogos] = useState([]);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [pdfLibrary, setPdfLibrary] = useState(null);
  const [pdfBusyPage, setPdfBusyPage] = useState(null);
  const [backgroundToolLogo, setBackgroundToolLogo] = useState(null);
  const [backgroundApplying, setBackgroundApplying] = useState(false);
  const [isPanning, setIsPanning] = useState(false);

  function releasePdfLibrary(libraryState = pdfLibrary) {
    libraryState?.pages?.forEach((page) => {
      if (page.previewUrl) URL.revokeObjectURL(page.previewUrl);
    });
  }

  function closePdfLibrary() {
    if (pdfBusyPage !== null) return;
    releasePdfLibrary();
    setPdfLibrary(null);
    setInfo('');
  }

  async function addPdfPage(pageNumber, options = {}) {
    const page = pdfLibrary?.pages?.find((item) => item.pageNumber === pageNumber);
    if (!page) return;
    setPdfBusyPage(pageNumber);
    setError('');

    try {
      const dataUrl = await fileToDataUrl(page.previewFile);
      const index = pdfLibrary.pages.findIndex((item) => item.pageNumber === pageNumber);
      const initialX = Number.isFinite(options.initialX)
        ? options.initialX
        : 0.25 + ((index % 3) * 0.25);
      const initialY = Number.isFinite(options.initialY)
        ? options.initialY
        : 0.35 + ((Math.floor(index / 3) % 3) * 0.18);

      await stageRef.current?.addLogo(dataUrl, {
        sourceName: pdfLibrary.fileName,
        sourceType: 'pdf',
        sourcePage: pageNumber,
        sourcePageCount: pdfLibrary.pageCount,
        targetView: view,
        initialX: Math.min(0.82, initialX),
        initialY: Math.min(0.82, initialY),
      });
      setInfo(`Página ${pageNumber} adicionada em ${view === 'front' ? 'Frente' : view === 'back' ? 'Costas' : 'Frente + Costas'}.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setPdfBusyPage(null);
    }
  }

  async function addAllPdfPages() {
    if (!pdfLibrary) return;
    for (let index = 0; index < pdfLibrary.pages.length; index += 1) {
      const page = pdfLibrary.pages[index];
      await addPdfPage(page.pageNumber, {
        initialX: 0.24 + ((index % 3) * 0.26),
        initialY: 0.28 + ((Math.floor(index / 3) % 3) * 0.22),
      });
    }
    setInfo('Todas as páginas foram adicionadas nesta vista para teste.');
  }

  async function handleLogoFile(file) {
    if (!file) return;
    setError('');
    setInfo('');
    try {
      const isPdf = file.type === 'application/pdf' || file.name?.toLowerCase().endsWith('.pdf');

      if (isPdf) {
        if (file.size > MAX_PDF_BYTES) {
          throw new Error('O PDF de teste deve ter no máximo 15 MB.');
        }

        releasePdfLibrary();
        setInfo('Lendo todas as páginas do PDF…');
        const { pages, pageCount } = await renderPdfLogoPreviews(file);
        setPdfLibrary({
          fileName: file.name,
          pageCount,
          pages: pages.map((page) => ({
            ...page,
            previewUrl: URL.createObjectURL(page.previewFile),
          })),
        });
        setInfo(`PDF carregado com ${pageCount} página(s). Clique em qualquer página para adicioná-la à vista atual.`);
      } else {
        const dataUrl = await fileToDataUrl(file);
        await stageRef.current?.addLogo(dataUrl, {
          sourceUrl: dataUrl,
          originalUrl: dataUrl,
          processingSource: dataUrl,
          sourceName: file.name,
          sourceType: 'image',
          targetView: view,
        });
        setInfo('Logo carregada para teste.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function openBackgroundRemoval() {
    const selected = stageRef.current?.getSelectedLogo();
    if (!selected) {
      setError('Clique primeiro na logo da qual deseja remover o fundo.');
      return;
    }
    if (selected.sourceType === 'pdf') {
      setError('PDF vetorial não precisa deste tratamento. Use PNG, JPG ou WEBP.');
      return;
    }
    setError('');
    setBackgroundToolLogo(selected);
  }

  async function applyBackgroundRemoval(blob) {
    if (!backgroundToolLogo) return;
    setBackgroundApplying(true);
    setError('');
    try {
      const processedUrl = URL.createObjectURL(blob);
      const replaced = await stageRef.current?.replaceSelectedLogoImage(processedUrl, {
        originalUrl: backgroundToolLogo.originalUrl || backgroundToolLogo.sourceUrl,
        sourceUrl: backgroundToolLogo.sourceUrl,
        sourceName: backgroundToolLogo.sourceName,
        processedUrl,
        backgroundRemoved: true,
      });
      if (!replaced) throw new Error('A logo selecionada não está mais disponível.');
      setBackgroundToolLogo(null);
      setInfo('Fundo removido localmente para o teste. Posição, tamanho e rotação foram preservados.');
    } catch (err) {
      setError(err.message);
      setInfo('');
    } finally {
      setBackgroundApplying(false);
    }
  }

  function removeSelectedLogo() {
    const removed = stageRef.current?.removeSelectedLogo();
    if (!removed) setError('Clique primeiro em uma logo para removê-la.');
    else {
      setError('');
      setInfo('Logo de teste removida.');
    }
  }

  function handleWheel(event) {
    event.preventDefault();
    const step = event.deltaY < 0 ? 0.1 : -0.1;
    setZoom((value) => Math.min(3, Math.max(0.5, Number((value + step).toFixed(2)))));
  }

  function handlePointerDownCapture(event) {
    if (event.button !== 2) return;
    const scroller = scrollRef.current;
    if (!scroller) return;
    event.preventDefault();
    event.stopPropagation();
    panRef.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      scrollLeft: scroller.scrollLeft,
      scrollTop: scroller.scrollTop,
    };
    setIsPanning(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function handlePointerMoveCapture(event) {
    const pan = panRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    const scroller = scrollRef.current;
    if (!scroller) return;
    event.preventDefault();
    event.stopPropagation();
    scroller.scrollLeft = pan.scrollLeft - (event.clientX - pan.clientX);
    scroller.scrollTop = pan.scrollTop - (event.clientY - pan.clientY);
  }

  function handlePointerEndCapture(event) {
    if (panRef.current?.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    panRef.current = null;
    setIsPanning(false);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }

  return (
    <div className="admin-logo-tester">
      <div className="admin-logo-test-actions">
        <div>
          <strong>Teste de logos</strong>
          <span>Use PNG, JPG, WEBP ou PDF vetorial. PDFs carregam todas as páginas como logos independentes.</span>
        </div>
        <div className="inline-actions admin-logo-buttons">
          <input
            ref={fileInputRef}
            className="sr-only"
            type="file"
            accept="image/png,image/jpeg,image/webp,application/pdf,.pdf"
            onChange={(event) => handleLogoFile(event.target.files?.[0])}
          />
          <button className="button button-primary" type="button" onClick={() => fileInputRef.current?.click()}>
            + Adicionar logo de teste
          </button>
          <button className="button button-background-local" type="button" onClick={openBackgroundRemoval} disabled={logos.length === 0}>
            ✦ Remover fundo
          </button>
          <button className="button button-secondary" type="button" onClick={removeSelectedLogo} disabled={logos.length === 0}>
            Remover selecionada
          </button>
          <span className="admin-logo-count">{logos.length} logo(s)</span>
        </div>
      </div>

      {error && <div className="inline-error admin-logo-error">{error}</div>}
      {!error && info && <div className="admin-logo-info">{info}</div>}

      <BackgroundRemovalDialog
        open={Boolean(backgroundToolLogo)}
        source={backgroundToolLogo?.processingSource || backgroundToolLogo?.originalUrl || backgroundToolLogo?.sourceUrl}
        fileName={backgroundToolLogo?.sourceName}
        onCancel={() => { if (!backgroundApplying) setBackgroundToolLogo(null); }}
        onApply={applyBackgroundRemoval}
      />

      {pdfLibrary && (
        <div className="admin-pdf-library-wrap">
          <PdfLogoLibrary
            fileName={pdfLibrary.fileName}
            pages={pdfLibrary.pages}
            pageCount={pdfLibrary.pageCount}
            currentView={view}
            busyPage={pdfBusyPage}
            onAddPage={addPdfPage}
            onAddAll={addAllPdfPages}
            onClose={closePdfLibrary}
          />
        </div>
      )}

      <div
        ref={scrollRef}
        className={`editor-scroll admin-logo-test-scroll ${isPanning ? 'is-panning' : ''}`}
        onWheel={handleWheel}
        onContextMenu={(event) => event.preventDefault()}
        onPointerDownCapture={handlePointerDownCapture}
        onPointerMoveCapture={handlePointerMoveCapture}
        onPointerUpCapture={handlePointerEndCapture}
        onPointerCancelCapture={handlePointerEndCapture}
      >
        <div className="editor-zoom-stage admin-logo-test-stage" style={{ width: `${zoom * 100}%` }}>
          <CustomerStage
            ref={stageRef}
            garment={garment}
            view={view}
            colorChoices={colorChoices}
            onRegionClick={onRegionClick}
            onLogosChange={setLogos}
          />
        </div>
        <div className="canvas-hint">Arraste, redimensione e gire a logo. Scroll dá zoom. Botão direito + arrastar move a imagem.</div>
      </div>
    </div>
  );
}
