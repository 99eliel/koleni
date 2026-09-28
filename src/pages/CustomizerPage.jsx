import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import BackgroundRemovalDialog from '../components/BackgroundRemovalDialog';
import CustomerStage from '../components/CustomerStage';
import MartinpelBrand from '../components/MartinpelBrand';
import PdfLogoLibrary from '../components/PdfLogoLibrary';
import { ensureClientUser } from '../lib/clientAuth';
import { getCustomerByWhatsapp, saveCustomerOrderSnapshot } from '../lib/customerRepo';
import { getGarment, listGarments } from '../lib/garmentRepo';
import { backgroundRemovedFile } from '../lib/localBackgroundRemoval';
import { createOrder } from '../lib/orderRepo';
import { renderPdfLogoPreviews } from '../lib/pdfLogoPreview';
import { createEmptySizeGrid, getSizeScaleLabel, getSizeScaleLabels, normalizeSizeScale } from '../lib/sizeScales';
import { uploadClientLogo, uploadClientLogoOriginalPdf, uploadFinalRender } from '../lib/storageImages';
import '../customer.css';

const VIEW_LABELS = {
  front: 'Frente',
  back: 'Costas',
  combined: 'Frente + Costas',
};

const PLACEMENT_PRESETS = [
  { label: 'Livre', x: null, y: null },
  { label: 'Peito esquerdo', x: 0.35, y: 0.27 },
  { label: 'Peito direito', x: 0.65, y: 0.27 },
  { label: 'Centro frontal', x: 0.5, y: 0.35 },
  { label: 'Costas superior', x: 0.5, y: 0.24 },
  { label: 'Costas central', x: 0.5, y: 0.42 },
  { label: 'Manga esquerda', x: 0.2, y: 0.32 },
  { label: 'Manga direita', x: 0.8, y: 0.32 },
];

function availableViews(garment) {
  return ['front', 'back', 'combined'].filter((key) => garment?.images?.[key]);
}

function safeFileName(value) {
  return (value || 'uniforme')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'uniforme';
}

function cleanSizeGrid(grid) {
  return Object.fromEntries(Object.entries(grid).filter(([, value]) => Number(value) > 0).map(([size, value]) => [size, Number(value)]));
}

function Catalog({ staffUser, isAdmin, logout }) {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    listGarments().then(setItems).catch((err) => setError(err.message));
  }, []);

  return (
    <main className="app-shell catalog-shell seller-catalog-shell">
      <div className="martinpel-appbar customer-brandbar seller-brandbar">
        <MartinpelBrand compact subtitle="Central interna de vendas" />
        <div className="seller-global-actions">
          <div className="seller-session">
            <span>Vendedor conectado</span>
            <strong>{staffUser?.email || 'Equipe Martinpel'}</strong>
          </div>
          {isAdmin && <Link className="button button-light catalog-admin-link" to="/admin">Painel administrativo</Link>}
          <button className="button admin-logout-button" type="button" onClick={logout}>Sair</button>
        </div>
      </div>

      <header className="customer-header catalog-header catalog-hero seller-catalog-hero">
        <div className="catalog-hero-copy">
          <span className="catalog-kicker">Central de vendas Martinpel</span>
          <h1>Monte a personalização junto com o cliente.</h1>
          <p>Escolha uma peça, defina cores, posição e medida das logos e registre um pedido pronto para orçamento e produção.</p>
        </div>
        <div className="catalog-hero-badge">
          <strong>Atendimento assistido</strong>
          <span>Venda • Ficha técnica • Produção</span>
        </div>
      </header>
      {error && <div className="notice notice-error">{error}</div>}
      <section className="catalog-grid">
        {items.map((item) => {
          const thumb = item.images?.front || item.images?.combined || item.images?.back;
          return (
            <Link className="panel catalog-card" key={item.id} to={`/customizar/${item.id}`}>
              <div className="catalog-image-wrap">{thumb ? <img src={thumb} alt={item.name} /> : <span>Sem imagem</span>}</div>
              <div className="catalog-card-body"><strong>{item.name}</strong><span>Montar pedido →</span></div>
            </Link>
          );
        })}
        {!error && items.length === 0 && <div className="panel empty-catalog">Nenhuma peça cadastrada ainda.</div>}
      </section>
    </main>
  );
}

export default function CustomizerPage({ staffUser, isAdmin = false, logout }) {
  const { garmentId } = useParams();
  const stageRef = useRef(null);
  const fileInputRef = useRef(null);
  const [garment, setGarment] = useState(null);
  const [clientUser, setClientUser] = useState(staffUser);
  const [view, setView] = useState('front');
  const [selectedRegionId, setSelectedRegionId] = useState(null);
  const [colorChoices, setColorChoices] = useState({});
  const [logos, setLogos] = useState([]);
  const [loading, setLoading] = useState(Boolean(garmentId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [orderId, setOrderId] = useState('');
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerWhatsapp, setCustomerWhatsapp] = useState('');
  const [quantity, setQuantity] = useState('');
  const [sizeGrid, setSizeGrid] = useState({});
  const [checkoutError, setCheckoutError] = useState('');
  const [customerRecord, setCustomerRecord] = useState(null);
  const [customerLookupBusy, setCustomerLookupBusy] = useState(false);
  const [pdfLibrary, setPdfLibrary] = useState(null);
  const [pdfBusyPage, setPdfBusyPage] = useState(null);
  const [backgroundToolLogo, setBackgroundToolLogo] = useState(null);
  const [backgroundApplying, setBackgroundApplying] = useState(false);
  const [logoPlacement, setLogoPlacement] = useState('Livre');
  const [logoWidthCm, setLogoWidthCm] = useState('9');

  const selectedRegion = useMemo(
    () => garment?.regions?.find((region) => region.id === selectedRegionId) ?? null,
    [garment, selectedRegionId],
  );

  const sizeLabels = useMemo(
    () => getSizeScaleLabels(garment?.sizeScale),
    [garment?.sizeScale],
  );

  const sizeTotal = useMemo(
    () => Object.values(sizeGrid).reduce((sum, value) => sum + (Number(value) || 0), 0),
    [sizeGrid],
  );

  useEffect(() => {
    if (!garmentId) return;
    setLoading(true);
    Promise.all([getGarment(garmentId), ensureClientUser()])
      .then(([data, user]) => {
        if (!data) throw new Error('Peça não encontrada.');
        setGarment(data);
        setClientUser(user);
        setSizeGrid(createEmptySizeGrid(getSizeScaleLabels(data.sizeScale)));
        const views = availableViews(data);
        setView(views[0] ?? 'front');
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [garmentId]);

  if (!garmentId) return <Catalog staffUser={staffUser} isAdmin={isAdmin} logout={logout} />;
  if (loading) return <main className="loading-screen">Carregando peça…</main>;
  if (!garment) return <main className="loading-screen"><div><p>{error || 'Peça não encontrada.'}</p><Link to="/">Voltar</Link></div></main>;

  function selectRegion(region) {
    if (region.locked) return;
    setSelectedRegionId(region.id);
  }

  function changeSelectedColor(color) {
    if (!selectedRegion || selectedRegion.locked) return;
    setColorChoices((current) => ({ ...current, [selectedRegion.id]: color }));
  }

  function releasePdfLibrary(libraryState = pdfLibrary) {
    libraryState?.pages?.forEach((page) => {
      if (page.previewUrl) URL.revokeObjectURL(page.previewUrl);
    });
  }

  function closePdfLibrary() {
    if (pdfBusyPage !== null) return;
    releasePdfLibrary();
    setPdfLibrary(null);
  }

  async function ensurePdfPageStorageUrl(pageNumber) {
    const page = pdfLibrary?.pages?.find((item) => item.pageNumber === pageNumber);
    if (!page) throw new Error('Página do PDF não encontrada.');
    if (page.storageUrl) return page.storageUrl;

    const user = clientUser ?? await ensureClientUser();
    setClientUser(user);
    const storageUrl = await uploadClientLogo(page.previewFile, user.uid);
    setPdfLibrary((current) => current ? {
      ...current,
      pages: current.pages.map((item) => item.pageNumber === pageNumber ? { ...item, storageUrl } : item),
    } : current);
    return storageUrl;
  }

  async function addPdfPage(pageNumber, options = {}) {
    if (!pdfLibrary) return;
    setPdfBusyPage(pageNumber);
    setError('');
    try {
      const storageUrl = await ensurePdfPageStorageUrl(pageNumber);
      const index = pdfLibrary.pages.findIndex((item) => item.pageNumber === pageNumber);
      const count = pdfLibrary.pages.length;
      const initialX = Number.isFinite(options.initialX) ? options.initialX : count > 1 ? 0.25 + ((index % 3) * 0.25) : 0.5;
      const initialY = Number.isFinite(options.initialY) ? options.initialY : 0.35 + ((Math.floor(index / 3) % 3) * 0.18);

      await stageRef.current?.addLogo(storageUrl, {
        sourceUrl: pdfLibrary.originalUrl,
        originalUrl: pdfLibrary.originalUrl,
        sourceName: pdfLibrary.fileName,
        sourceType: 'pdf',
        sourcePage: pageNumber,
        sourcePageCount: pdfLibrary.pageCount,
        targetView: view,
        initialX: Math.min(0.82, initialX),
        initialY: Math.min(0.82, initialY),
        placementLabel: 'Livre',
        widthCm: 9,
      });
      setMessage(`Página ${pageNumber} adicionada em ${VIEW_LABELS[view]}.`);
    } catch (err) {
      setError(err.message);
      setMessage('');
    } finally {
      setPdfBusyPage(null);
    }
  }

  async function addAllPdfPages() {
    if (!pdfLibrary) return;
    setError('');
    setMessage(`Adicionando ${pdfLibrary.pages.length} páginas em ${VIEW_LABELS[view]}…`);
    for (let index = 0; index < pdfLibrary.pages.length; index += 1) {
      const page = pdfLibrary.pages[index];
      await addPdfPage(page.pageNumber, {
        initialX: 0.24 + ((index % 3) * 0.26),
        initialY: 0.28 + ((Math.floor(index / 3) % 3) * 0.22),
      });
    }
    setMessage(`Todas as páginas do PDF foram adicionadas em ${VIEW_LABELS[view]}.`);
  }

  async function handleLogo(file) {
    if (!file) return;
    setBusy(true);
    setError('');
    setMessage('Preparando logo e verificando biblioteca…');
    try {
      const user = clientUser ?? await ensureClientUser();
      setClientUser(user);
      const isPdf = file.type === 'application/pdf' || file.name?.toLowerCase().endsWith('.pdf');

      if (isPdf) {
        releasePdfLibrary();
        const originalUrl = await uploadClientLogoOriginalPdf(file, user.uid);
        const { pages, pageCount } = await renderPdfLogoPreviews(file);
        const pagesWithUrls = pages.map((page) => ({ ...page, previewUrl: URL.createObjectURL(page.previewFile), storageUrl: '' }));
        setPdfLibrary({ fileName: file.name, originalUrl, pageCount, pages: pagesWithUrls });
        setMessage(`PDF pronto com ${pageCount} página(s). Arquivos repetidos são reaproveitados automaticamente.`);
      } else {
        const processingSource = URL.createObjectURL(file);
        const url = await uploadClientLogo(file, user.uid);
        await stageRef.current?.addLogo(url, {
          sourceUrl: url,
          originalUrl: url,
          processingSource,
          processingSourceOwned: true,
          sourceName: file.name,
          sourceType: 'image',
          sourcePage: 1,
          sourcePageCount: 1,
          targetView: view,
          placementLabel: 'Livre',
          widthCm: 9,
        });
        setMessage('Logo adicionada. Se esse arquivo já existia na biblioteca, nenhuma nova cópia foi criada.');
      }
    } catch (err) {
      setError(err.message);
      setMessage('');
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function applyLogoProductionSettings() {
    const preset = PLACEMENT_PRESETS.find((item) => item.label === logoPlacement) || PLACEMENT_PRESETS[0];
    const widthCm = Number(logoWidthCm);
    if (!Number.isFinite(widthCm) || widthCm <= 0 || widthCm > 100) {
      setError('Informe uma largura válida da logo em centímetros.');
      return;
    }
    const updated = stageRef.current?.updateSelectedLogoProductionMeta({
      placementLabel: preset.label,
      widthCm,
      x: Number.isFinite(preset.x) ? preset.x : undefined,
      y: Number.isFinite(preset.y) ? preset.y : undefined,
    });
    if (!updated) {
      setError('Clique primeiro na logo que deseja configurar.');
      return;
    }
    setError('');
    setMessage(`Logo configurada: ${preset.label} · ${widthCm} cm.`);
  }

  function openBackgroundRemoval() {
    const selected = stageRef.current?.getSelectedLogo();
    if (!selected) {
      setError('Clique primeiro na logo da qual deseja remover o fundo.');
      setMessage('');
      return;
    }
    if (selected.sourceType === 'pdf') {
      setError('PDF vetorial não precisa deste tratamento. Use a ferramenta em logos PNG, JPG ou WEBP.');
      setMessage('');
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
      const user = clientUser ?? await ensureClientUser();
      setClientUser(user);
      const processedFile = backgroundRemovedFile(blob, backgroundToolLogo.sourceName || 'logo.png');
      const processedUrl = await uploadClientLogo(processedFile, user.uid);
      const originalUrl = backgroundToolLogo.originalUrl || backgroundToolLogo.sourceUrl || backgroundToolLogo.storageUrl;
      const replaced = await stageRef.current?.replaceSelectedLogoImage(processedUrl, {
        originalUrl,
        sourceUrl: backgroundToolLogo.sourceUrl || originalUrl,
        sourceName: backgroundToolLogo.sourceName || processedFile.name,
        processedUrl,
        backgroundRemoved: true,
      });
      if (!replaced) throw new Error('A logo selecionada não está mais disponível.');
      setBackgroundToolLogo(null);
      setMessage('Fundo removido localmente. Original preservado e resultado deduplicado na biblioteca.');
    } catch (err) {
      setError(err.message);
      setMessage('');
    } finally {
      setBackgroundApplying(false);
    }
  }

  function removeLogo() {
    const removed = stageRef.current?.removeSelectedLogo();
    setMessage(removed ? 'Logo selecionada removida.' : 'Clique primeiro em uma logo para removê-la.');
  }

  async function downloadCurrentImage() {
    setBusy(true);
    setError('');
    setMessage(`Gerando ${VIEW_LABELS[view].toLowerCase()} para download…`);
    try {
      const blob = await stageRef.current?.exportView(view);
      if (!blob) throw new Error('Não foi possível gerar a imagem desta vista.');
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `${safeFileName(garment.name)}-${view}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      setMessage(`${VIEW_LABELS[view]} baixada em PNG com sucesso.`);
    } catch (err) {
      setError(err.message);
      setMessage('');
    } finally {
      setBusy(false);
    }
  }

  async function lookupCustomer() {
    setCustomerLookupBusy(true);
    setCheckoutError('');
    try {
      const record = await getCustomerByWhatsapp(customerWhatsapp);
      setCustomerRecord(record);
      if (!record) {
        setMessage('Cliente ainda não cadastrado. O cadastro será criado junto com o pedido.');
        return;
      }
      if (record.name) setCustomerName(record.name);
      setMessage(`Cliente encontrado: ${record.name || 'cadastro sem nome'}. Apenas 1 leitura foi usada.`);
    } catch (err) {
      setCheckoutError(err.message);
    } finally {
      setCustomerLookupBusy(false);
    }
  }

  async function reuseLastOrder() {
    const template = customerRecord?.lastOrderTemplate;
    if (!template) return;
    if (template.garmentId !== garmentId) {
      setCheckoutError(`O último pedido deste cliente foi de “${template.garmentName || 'outra peça'}”. Abra essa peça para repetir o design.`);
      return;
    }

    setBusy(true);
    try {
      setColorChoices(template.colorChoices || {});
      setSizeGrid(createEmptySizeGrid(sizeLabels, template.sizeGrid || {}));
      setQuantity(template.quantity ? String(template.quantity) : '');
      stageRef.current?.clearLogos();
      for (const logo of template.logos || []) {
        const url = logo.processedUrl || logo.storageUrl || logo.sourceUrl;
        if (!url) continue;
        await stageRef.current?.addLogo(url, {
          ...logo,
          targetView: logo.position?.view || view,
          initialX: logo.position?.x,
          initialY: logo.position?.y,
          rotation: logo.position?.rotation,
        });
      }
      setMessage('Último pedido reaplicado sem duplicar imagens ou PDFs no Storage.');
      setCheckoutOpen(false);
    } catch (err) {
      setCheckoutError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function openCheckout() {
    const incompleteLogo = logos.find((logo) => !logo.placementLabel || !Number(logo.widthCm));
    if (incompleteLogo) {
      setError('Há uma logo sem posição ou medida de produção. Selecione-a e configure antes de registrar o pedido.');
      return;
    }
    setError('');
    setMessage('');
    setOrderId('');
    setCheckoutError('');
    setCheckoutOpen(true);
  }

  function closeCheckout() {
    if (busy) return;
    setCheckoutOpen(false);
    setCheckoutError('');
  }

  async function handleCheckoutSubmit(event) {
    event.preventDefault();
    const cleanName = customerName.trim();
    const cleanWhatsapp = customerWhatsapp.trim();
    if (!cleanName) return setCheckoutError('Digite o nome do cliente.');
    if (!cleanWhatsapp) return setCheckoutError('Digite o WhatsApp do cliente.');

    const manualQuantity = Number(quantity);
    const parsedQuantity = sizeTotal > 0 ? sizeTotal : manualQuantity;
    if (!Number.isInteger(parsedQuantity) || parsedQuantity < 1) {
      setCheckoutError('Informe a grade de tamanhos ou uma quantidade total válida.');
      return;
    }

    setCheckoutError('');
    setBusy(true);
    setError('');
    setMessage('Gerando arte final e registrando pedido…');
    setOrderId('');

    try {
      const user = clientUser ?? await ensureClientUser();
      setClientUser(user);
      const finalImages = {};
      for (const targetView of availableViews(garment)) {
        const blob = await stageRef.current?.exportView(targetView);
        if (blob) finalImages[targetView] = await uploadFinalRender(blob, user.uid, `${targetView}-${garmentId}`);
      }

      const effectiveColors = Object.fromEntries((garment.regions ?? []).map((region) => [region.id, colorChoices[region.id] ?? region.defaultColor]));
      const compactGrid = cleanSizeGrid(sizeGrid);
      const normalizedSizeScale = normalizeSizeScale(garment.sizeScale);
      const firstFinalImage = finalImages.front || finalImages.combined || finalImages.back || '';
      const id = await createOrder({
        garmentId,
        garmentName: garment.name,
        sellerUid: user.uid,
        sellerEmail: user.email || '',
        customerName: cleanName,
        whatsapp: cleanWhatsapp,
        quantity: parsedQuantity,
        sizeScale: normalizedSizeScale,
        sizeGrid: compactGrid,
        colorChoices: effectiveColors,
        logos,
        finalImages,
        finalImageUrl: firstFinalImage,
      });

      await saveCustomerOrderSnapshot({
        customerName: cleanName,
        whatsapp: cleanWhatsapp,
        sellerEmail: user.email || '',
        garmentId,
        garmentName: garment.name,
        colorChoices: effectiveColors,
        logos,
        sizeGrid: compactGrid,
        quantity: parsedQuantity,
      });

      setCheckoutOpen(false);
      setOrderId(id);
      setMessage('Pedido registrado. Cliente, grade, ficha de design e vendedor responsável ficaram vinculados sem duplicar logos.');
    } catch (err) {
      setCheckoutError(err.message || 'Não foi possível registrar o pedido.');
      setMessage('');
    } finally {
      setBusy(false);
    }
  }

  const regionsInView = (garment.regions ?? []).filter((region) => region.view === view).sort((a, b) => (b.zIndex ?? 0) - (a.zIndex ?? 0));
  const views = availableViews(garment);
  const colorsReady = (garment.regions ?? []).every((region) => Boolean(colorChoices[region.id] ?? region.defaultColor));
  const logosReady = logos.every((logo) => Boolean(logo.placementLabel) && Number(logo.widthCm) > 0);
  const preflight = [
    ['Cores definidas', colorsReady],
    ['Posição e medida das logos', logosReady],
    ['Vista da peça carregada', views.length > 0],
  ];
  const preflightDone = preflight.filter(([, ok]) => ok).length;

  return (
    <main className="app-shell customer-shell">
      <div className="martinpel-appbar customer-brandbar seller-brandbar">
        <MartinpelBrand compact subtitle="Atendimento de venda" />
        <div className="seller-global-actions">
          <div className="seller-session compact"><span>Vendedor</span><strong>{staffUser?.email || 'Equipe Martinpel'}</strong></div>
          <Link className="button button-light back-to-catalog" to="/">← Catálogo</Link>
          <button className="button admin-logout-button" type="button" onClick={logout}>Sair</button>
        </div>
      </div>

      <div className="customer-flow-strip" aria-label="Etapas da personalização">
        <div className="is-active"><span>1</span><strong>Cores</strong><small>Escolha as áreas</small></div>
        <div className={logos.length > 0 ? 'is-active' : ''}><span>2</span><strong>Logos</strong><small>Posição e medida</small></div>
        <div className={preflightDone === preflight.length ? 'is-active' : ''}><span>3</span><strong>Conferir</strong><small>Validação local</small></div>
        <div className={orderId ? 'is-active' : ''}><span>4</span><strong>Pedido</strong><small>Registrar atendimento</small></div>
      </div>

      <header className="customer-header martinpel-page-header customer-piece-header">
        <div className="page-heading-block">
          <p className="eyebrow">Montagem do pedido</p>
          <h1>{garment.name}</h1>
          <p className="page-subtitle">Configure a peça com dados que já seguem prontos para ficha técnica e produção.</p>
        </div>
        <div className="customer-view-tabs">
          {views.map((targetView) => <button key={targetView} type="button" className={view === targetView ? 'active' : ''} onClick={() => { setView(targetView); setSelectedRegionId(null); }}>{VIEW_LABELS[targetView]}</button>)}
        </div>
      </header>

      {(message || error) && <div className={error ? 'notice notice-error' : 'notice notice-success'}>{error || message}{orderId && <strong className="order-code"> Código: {orderId}</strong>}</div>}

      <section className="customer-layout customer-workspace">
        <section className="panel customer-stage-panel">
          <CustomerStage ref={stageRef} garment={garment} view={view} colorChoices={colorChoices} onRegionClick={selectRegion} onLogosChange={setLogos} />
        </section>

        <aside className="panel customer-tools customer-tools-v2">
          <div className="customer-tools-head"><div><p className="eyebrow">Personalização</p><h2>Monte sua peça</h2></div><span className="customer-tools-badge">{logos.length} logo(s)</span></div>
          <p className="customer-help">O preview continua livre, mas posição e medida ficam registradas para produção.</p>

          <div className="customer-tool-section-title"><span>01</span><strong>Cores da peça</strong></div>
          <div className="region-choice-list">
            {regionsInView.map((region) => (
              <button key={region.id} type="button" className={`region-choice ${selectedRegionId === region.id ? 'active' : ''} ${region.locked ? 'locked' : ''}`} onClick={() => selectRegion(region)} disabled={region.locked}>
                <span className="color-dot" style={{ background: colorChoices[region.id] ?? region.defaultColor }} /><span>{region.label}</span>{region.locked && <small>🔒</small>}
              </button>
            ))}
          </div>
          {selectedRegion && !selectedRegion.locked && <div className="selected-color-box"><label>Cor de {selectedRegion.label}<input type="color" value={colorChoices[selectedRegion.id] ?? selectedRegion.defaultColor} onChange={(event) => changeSelectedColor(event.target.value)} /></label><button type="button" className="mini-link" onClick={() => setColorChoices((current) => { const next = { ...current }; delete next[selectedRegion.id]; return next; })}>Voltar à cor padrão</button></div>}

          <div className="tool-divider" />
          <div className="customer-tool-section-title"><span>02</span><strong>Aplicar sua marca</strong></div>
          <input ref={fileInputRef} className="sr-only" type="file" accept="image/png,image/jpeg,image/webp,application/pdf,.pdf" onChange={(event) => handleLogo(event.target.files?.[0])} />
          <button type="button" className="button button-primary full-width" disabled={busy} onClick={() => fileInputRef.current?.click()}>+ Adicionar logo</button>
          <p className="logo-upload-help">PNG, JPG, WEBP ou PDF. A biblioteca identifica arquivos iguais por hash e reaproveita a cópia já existente.</p>
          {pdfLibrary && <PdfLogoLibrary fileName={pdfLibrary.fileName} pages={pdfLibrary.pages} pageCount={pdfLibrary.pageCount} currentView={view} busyPage={pdfBusyPage} onAddPage={addPdfPage} onAddAll={addAllPdfPages} onClose={closePdfLibrary} />}

          {logos.length > 0 && (
            <div className="logo-production-settings">
              <strong>Logo selecionada · dados de produção</strong>
              <label>Posição
                <select value={logoPlacement} onChange={(event) => setLogoPlacement(event.target.value)}>{PLACEMENT_PRESETS.map((preset) => <option key={preset.label}>{preset.label}</option>)}</select>
              </label>
              <label>Largura da aplicação (cm)
                <input type="number" min="1" max="100" step="0.5" value={logoWidthCm} onChange={(event) => setLogoWidthCm(event.target.value)} />
              </label>
              <button type="button" className="button button-secondary full-width" onClick={applyLogoProductionSettings}>Aplicar na logo selecionada</button>
            </div>
          )}

          <button type="button" className="button button-background-local full-width" disabled={busy || logos.length === 0} onClick={openBackgroundRemoval}>✦ Remover fundo da logo</button>
          <button type="button" className="button button-secondary full-width" disabled={busy || logos.length === 0} onClick={removeLogo}>Remover logo selecionada</button>
          <div className="logo-count">{logos.length} logo(s) · arquivos repetidos não ocupam espaço novamente</div>

          <div className="tool-divider" />
          <div className="customer-tool-section-title"><span>03</span><strong>Conferência automática</strong></div>
          <div className="seller-preflight">
            <div className="seller-preflight-head"><strong>{preflightDone}/{preflight.length} verificações</strong><span>{preflightDone === preflight.length ? 'Pronto para registrar' : 'Revise antes do pedido'}</span></div>
            {preflight.map(([label, ok]) => <div className={ok ? 'ok' : ''} key={label}><span>{ok ? '✓' : '!'}</span><strong>{label}</strong></div>)}
          </div>

          <button type="button" className="button button-success finalize-button" disabled={busy} onClick={openCheckout}>{busy ? 'Processando…' : 'Registrar pedido'}</button>
          <button type="button" className="button button-secondary full-width download-final-button" disabled={busy} onClick={downloadCurrentImage}>Baixar imagem pronta · {VIEW_LABELS[view]}</button>
          {views.length > 1 && <p className="download-help">Troque entre as vistas para baixar cada imagem separadamente.</p>}
        </aside>
      </section>

      <BackgroundRemovalDialog open={Boolean(backgroundToolLogo)} source={backgroundToolLogo?.processingSource || backgroundToolLogo?.originalUrl || backgroundToolLogo?.sourceUrl} fileName={backgroundToolLogo?.sourceName} onCancel={() => { if (!backgroundApplying) setBackgroundToolLogo(null); }} onApply={applyBackgroundRemoval} />

      {checkoutOpen && (
        <div className="checkout-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeCheckout(); }}>
          <form className="panel checkout-card checkout-card-wide" onSubmit={handleCheckoutSubmit}>
            <div><p className="eyebrow">Registrar pedido</p><h2>Cliente e grade de produção</h2><p className="muted checkout-intro">O cliente é localizado por uma chave derivada do WhatsApp: uma consulta direta, sem varrer a base.</p></div>

            <div className="customer-lookup-row">
              <label>WhatsApp
                <input type="tel" value={customerWhatsapp} onChange={(event) => { setCustomerWhatsapp(event.target.value); setCustomerRecord(null); }} placeholder="Ex.: (62) 99999-9999" autoComplete="tel" disabled={busy} />
              </label>
              <button type="button" className="button button-secondary" onClick={lookupCustomer} disabled={busy || customerLookupBusy}>{customerLookupBusy ? 'Buscando…' : 'Buscar cadastro'}</button>
            </div>

            {customerRecord && (
              <div className="customer-found-card">
                <div><span>Cliente recorrente</span><strong>{customerRecord.name || 'Cliente cadastrado'}</strong><small>{customerRecord.orderCount || 0} pedido(s) registrado(s)</small></div>
                {customerRecord.lastOrderTemplate && <button type="button" className="button button-secondary" onClick={reuseLastOrder} disabled={busy}>Repetir último pedido</button>}
              </div>
            )}

            <label>Nome do cliente
              <input autoFocus value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Nome / empresa" autoComplete="name" disabled={busy} />
            </label>

            <div className="size-grid-editor">
              <div className="size-grid-title"><strong>Grade de tamanhos</strong><span>{getSizeScaleLabel(garment.sizeScale)} · Total pela grade: {sizeTotal}</span></div>
              <div className="size-grid-inputs">
                {sizeLabels.map((size) => <label key={size}><span>{size}</span><input type="number" min="0" step="1" value={sizeGrid[size] ?? 0} onChange={(event) => setSizeGrid((current) => ({ ...current, [size]: Math.max(0, Number(event.target.value) || 0) }))} disabled={busy} /></label>)}
              </div>
            </div>

            <label>Quantidade total <span className="optional-label">(use apenas se não preencher a grade)</span>
              <input type="number" min="1" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="Ex.: 20" disabled={busy || sizeTotal > 0} />
            </label>

            {checkoutError && <div className="checkout-error">{checkoutError}</div>}
            <div className="checkout-actions"><button type="button" className="button button-secondary" onClick={closeCheckout} disabled={busy}>Cancelar</button><button type="submit" className="button button-success" disabled={busy}>{busy ? 'Registrando…' : `Confirmar pedido · ${sizeTotal || Number(quantity) || 0} peça(s)`}</button></div>
          </form>
        </div>
      )}
    </main>
  );
}
