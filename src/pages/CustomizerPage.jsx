import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import BackgroundRemovalDialog from '../components/BackgroundRemovalDialog';
import CustomerStage from '../components/CustomerStage';
import PieceCartCheckout from '../components/PieceCartCheckout';
import LogoManager from '../components/LogoManager';
import LogoColorEditor from '../components/LogoColorEditor';
import MartinpelBrand from '../components/MartinpelBrand';
import PdfLogoLibrary from '../components/PdfLogoLibrary';
import { ensureClientUser } from '../lib/clientAuth';
import { getCustomerByWhatsapp, saveCustomerOrderSnapshot } from '../lib/customerRepo';
import { getGarment, listGarments } from '../lib/garmentRepo';
import { backgroundRemovedFile } from '../lib/localBackgroundRemoval';
import { createOrder } from '../lib/orderRepo';
import { addPieceToCart, readPieceCart } from '../lib/multiPieceCart';
import { renderPdfLogoPreviews } from '../lib/pdfLogoPreview';
import { createEmptySizeGrid, getSizeScaleLabel, getSizeScaleLabels, normalizeSizeScale } from '../lib/sizeScales';
import { uploadClientLogo, uploadClientLogoOriginalPdf, uploadFinalRender } from '../lib/storageImages';
import '../customer.css';

const VIEW_LABELS = { front: 'Foto 1', back: 'Foto 2', combined: 'Foto 3' };
const COLOR_PRESETS = ['#ffffff', '#111827', '#0b2b52', '#2563eb', '#dc2626', '#16a34a', '#facc15', '#9ca3af'];
const TEXT_FONT_OPTIONS = [
  ['Arial', 'Arial · limpa'],
  ['Arial Black', 'Arial Black · forte'],
  ['Verdana', 'Verdana · legível'],
  ['Tahoma', 'Tahoma · compacta'],
  ['Trebuchet MS', 'Trebuchet · moderna'],
  ['Georgia', 'Georgia · clássica'],
  ['Times New Roman', 'Times · tradicional'],
  ['Courier New', 'Courier · técnica'],
  ['Impact', 'Impact · destaque'],
];
const TEXT_SIZE_OPTIONS = [
  ['0.14', 'Pequeno'],
  ['0.18', 'Médio'],
  ['0.22', 'Grande'],
  ['0.28', 'Extra grande'],
  ['0.34', 'Máximo'],
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
          <div className="seller-session"><span>Vendedor conectado</span><strong>{staffUser?.email || 'Equipe Koleni'}</strong></div>
          {isAdmin && <Link className="button button-light catalog-admin-link" to="/admin">Painel administrativo</Link>}
          <button className="button admin-logout-button" type="button" onClick={logout}>Sair</button>
        </div>
      </div>

      <header className="customer-header catalog-header catalog-hero seller-catalog-hero">
        <div className="catalog-hero-copy">
          <span className="catalog-kicker">Central de vendas Koleni</span>
          <h1>Monte a personalização junto com o cliente.</h1>
          <p>Escolha uma peça, ajuste as cores e posicione logos, nomes e números livremente antes de registrar o pedido.</p>
        </div>
        <div className="catalog-hero-badge"><strong>Atendimento assistido</strong><span>Venda • Layout • Produção</span></div>
      </header>
      {error && <div className="notice notice-error">{error}</div>}
      <PieceCartCheckout staffUser={staffUser} />
      <section className="catalog-grid">
        {items.map((item) => {
          const thumb = Object.values(item.images || {}).find(Boolean);
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
  const navigate = useNavigate();
  const stageRef = useRef(null);
  const fileInputRef = useRef(null);
  const undoStackRef = useRef([]);
  const redoStackRef = useRef([]);
  const suppressHistoryRef = useRef(false);
  const [historyTick, setHistoryTick] = useState(0);
  const [garment, setGarment] = useState(null);
  const [clientUser, setClientUser] = useState(staffUser);
  const [view, setView] = useState('front');
  const [selectedRegionId, setSelectedRegionId] = useState(null);
  const [colorChoices, setColorChoices] = useState({});
  const [logos, setLogos] = useState([]);
  const [texts, setTexts] = useState([]);
  const [logoManagerOpen, setLogoManagerOpen] = useState(false);
  const [logoColorEditorOpen, setLogoColorEditorOpen] = useState(false);
  const [logoColorTarget, setLogoColorTarget] = useState(null);
  const [logoEditColor, setLogoEditColor] = useState('#111827');
  const [logoEditMode, setLogoEditMode] = useState('flat');
  const [logoEditOpacity, setLogoEditOpacity] = useState(100);
  const [logoColorApplying, setLogoColorApplying] = useState(false);
  const [textPanelOpen, setTextPanelOpen] = useState(false);
  const [textDraft, setTextDraft] = useState('');
  const [textColor, setTextColor] = useState('#111827');
  const [textBackgroundColor, setTextBackgroundColor] = useState('#ffffff');
  const [textFontFamily, setTextFontFamily] = useState('Arial');
  const [textFontWeight, setTextFontWeight] = useState('700');
  const [textFontStyle, setTextFontStyle] = useState('normal');
  const [textInitialScale, setTextInitialScale] = useState('0.22');
  const [textUppercase, setTextUppercase] = useState(false);
  const [loading, setLoading] = useState(Boolean(garmentId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [orderId, setOrderId] = useState('');
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutMode, setCheckoutMode] = useState('single');
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

  const selectedRegion = useMemo(
    () => garment?.regions?.find((region) => region.id === selectedRegionId) ?? null,
    [garment, selectedRegionId],
  );
  const sizeLabels = useMemo(() => getSizeScaleLabels(garment?.sizeScale), [garment?.sizeScale]);
  const sizeTotal = useMemo(() => Object.values(sizeGrid).reduce((sum, value) => sum + (Number(value) || 0), 0), [sizeGrid]);
  const textPreview = textUppercase ? (textDraft.trim() || 'SEU NOME').toUpperCase() : (textDraft.trim() || 'Seu nome');

  function resetHistory() {
    undoStackRef.current = [];
    redoStackRef.current = [];
    stageRef.current?.resetHistory?.();
    setHistoryTick((value) => value + 1);
  }

  function recordStageAction() {
    if (suppressHistoryRef.current) return;
    undoStackRef.current.push({ type: 'stage' });
    redoStackRef.current = [];
    setHistoryTick((value) => value + 1);
  }

  function setColorWithHistory(regionId, color) {
    const next = { ...colorChoices, [regionId]: color };
    undoStackRef.current.push({ type: 'color', previous: colorChoices, next });
    redoStackRef.current = [];
    setColorChoices(next);
    setHistoryTick((value) => value + 1);
  }

  function resetRegionColor(regionId) {
    const next = { ...colorChoices };
    delete next[regionId];
    undoStackRef.current.push({ type: 'color', previous: colorChoices, next });
    redoStackRef.current = [];
    setColorChoices(next);
    setHistoryTick((value) => value + 1);
  }

  async function undoDesign() {
    const action = undoStackRef.current.pop();
    if (!action) return;
    suppressHistoryRef.current = true;
    try {
      if (action.type === 'stage') await stageRef.current?.undo?.();
      else setColorChoices(action.previous);
      redoStackRef.current.push(action);
    } finally {
      suppressHistoryRef.current = false;
      setHistoryTick((value) => value + 1);
    }
  }

  async function redoDesign() {
    const action = redoStackRef.current.pop();
    if (!action) return;
    suppressHistoryRef.current = true;
    try {
      if (action.type === 'stage') await stageRef.current?.redo?.();
      else setColorChoices(action.next);
      undoStackRef.current.push(action);
    } finally {
      suppressHistoryRef.current = false;
      setHistoryTick((value) => value + 1);
    }
  }

  useEffect(() => {
    function onKeyDown(event) {
      const tag = event.target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || event.target?.isContentEditable) return;
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault();
        undoDesign();
      } else if (key === 'y' || (key === 'z' && event.shiftKey)) {
        event.preventDefault();
        redoDesign();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

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

  function releasePdfLibrary(libraryState = pdfLibrary) {
    libraryState?.pages?.forEach((page) => { if (page.previewUrl) URL.revokeObjectURL(page.previewUrl); });
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
        });
        setMessage('Logo adicionada. Arraste, gire e redimensione livremente sobre a peça.');
      }
    } catch (err) {
      setError(err.message);
      setMessage('');
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function addText() {
    const clean = textDraft.trim();
    if (!clean) return setError('Digite um nome, número ou texto para adicionar.');
    const formattedText = textUppercase ? clean.toUpperCase() : clean;
    stageRef.current?.addText(formattedText, {
      color: textColor,
      backgroundColor: textBackgroundColor,
      targetView: view,
      fontFamily: textFontFamily,
      fontWeight: textFontWeight,
      fontStyle: textFontStyle,
      position: { scale: Number(textInitialScale) || 0.22, view },
    });
    setTextDraft('');
    setError('');
    setMessage('Texto personalizado adicionado. Arraste, gire e redimensione livremente sobre a peça.');
  }

  function openLogoColorEditor() {
    const selected = stageRef.current?.getSelectedLogo();
    if (!selected) {
      setError('Selecione uma logo na peça para editar a cor.');
      setMessage('');
      return;
    }
    setLogoColorTarget(selected);
    setLogoEditColor(selected.logoColor || '#111827');
    setLogoEditMode(selected.logoColorMode && selected.logoColorMode !== 'original' ? selected.logoColorMode : 'flat');
    setLogoEditOpacity(Number.isFinite(Number(selected.logoOpacity)) ? Number(selected.logoOpacity) : 100);
    setLogoColorEditorOpen(true);
    setError('');
    setMessage('');
  }

  async function applyLogoColor() {
    if (!logoColorTarget?.id || logoColorApplying) return;
    setLogoColorApplying(true);
    setError('');
    try {
      const selected = stageRef.current?.selectLogoById?.(logoColorTarget.id);
      if (!selected) throw new Error('Selecione novamente a logo que deseja editar.');
      const updated = await stageRef.current?.updateSelectedLogoAppearance?.({
        logoColorMode: logoEditMode,
        logoColor: logoEditColor,
        logoOpacity: logoEditOpacity,
      });
      if (!updated) throw new Error('Não foi possível aplicar a nova cor na logo.');
      setLogoColorTarget(stageRef.current?.getSelectedLogo?.() || logoColorTarget);
      setMessage('Cor da logo atualizada. O arquivo original continua preservado.');
    } catch (err) {
      setError(err.message);
      setMessage('');
    } finally {
      setLogoColorApplying(false);
    }
  }

  async function restoreLogoColor() {
    if (!logoColorTarget?.id || logoColorApplying) return;
    setLogoColorApplying(true);
    setError('');
    try {
      const selected = stageRef.current?.selectLogoById?.(logoColorTarget.id);
      if (!selected) throw new Error('Selecione novamente a logo que deseja restaurar.');
      const updated = await stageRef.current?.updateSelectedLogoAppearance?.({
        logoColorMode: 'original',
        logoColor: '#111827',
        logoOpacity: 100,
      });
      if (!updated) throw new Error('Não foi possível restaurar a logo.');
      setLogoEditColor('#111827');
      setLogoEditMode('flat');
      setLogoEditOpacity(100);
      setLogoColorTarget(stageRef.current?.getSelectedLogo?.() || logoColorTarget);
      setMessage('A aparência original da logo foi restaurada.');
    } catch (err) {
      setError(err.message);
      setMessage('');
    } finally {
      setLogoColorApplying(false);
    }
  }

  function openBackgroundRemoval() {
    const selected = stageRef.current?.getSelectedLogo();
    if (!selected) {
      setError('Selecione uma logo para remover o fundo. Textos não precisam deste tratamento.');
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
      setMessage('Fundo removido. Original preservado e resultado deduplicado na biblioteca.');
    } catch (err) {
      setError(err.message);
      setMessage('');
    } finally {
      setBackgroundApplying(false);
    }
  }

  function removeSelectedItem() {
    const removed = stageRef.current?.removeSelectedItem?.();
    setMessage(removed ? 'Item selecionado removido.' : 'Clique primeiro na logo ou texto que deseja remover.');
  }

  function selectManagedLogo(logo) {
    if (!logo?.id) return;
    const targetView = logo.position?.view || view;
    if (targetView !== view) {
      setView(targetView);
      setSelectedRegionId(null);
    }
    window.setTimeout(() => {
      const selected = stageRef.current?.selectLogoById?.(logo.id);
      setMessage(selected
        ? `Logo “${logo.sourceName || 'sem nome'}” selecionada em ${VIEW_LABELS[targetView] || targetView}.`
        : 'Não foi possível selecionar essa logo.');
    }, targetView === view ? 0 : 80);
  }

  function removeManagedLogo(logo) {
    if (!logo?.id) return;
    const removed = stageRef.current?.removeLogoById?.(logo.id);
    if (removed) {
      setMessage(`Logo “${logo.sourceName || 'sem nome'}” removida da peça.`);
      setError('');
    } else {
      setError('Não foi possível remover essa logo.');
      setMessage('');
    }
  }

  async function downloadCurrentImage() {
    setBusy(true);
    setError('');
    setMessage(`Gerando ${VIEW_LABELS[view]} para download…`);
    try {
      const blob = await stageRef.current?.exportView(view);
      if (!blob) throw new Error('Não foi possível gerar a imagem desta foto.');
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
      setMessage(`Cliente encontrado: ${record.name || 'cadastro sem nome'}.`);
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
      suppressHistoryRef.current = true;
      await stageRef.current?.restoreDesignState({ logos: template.logos || [], texts: template.texts || [] }, { resetHistory: true });
      suppressHistoryRef.current = false;
      resetHistory();
      setMessage('Último pedido reaplicado sem duplicar imagens ou PDFs no Storage.');
      setCheckoutOpen(false);
    } catch (err) {
      suppressHistoryRef.current = false;
      setCheckoutError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function openCheckout(mode = 'single') {
    setCheckoutMode(mode);
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
    if (checkoutMode === 'single' && !cleanName) return setCheckoutError('Digite o nome do cliente.');
    if (checkoutMode === 'single' && !cleanWhatsapp) return setCheckoutError('Digite o WhatsApp do cliente.');
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
        let blob;
        try {
          blob = await stageRef.current?.exportView(targetView);
        } catch (imageError) {
          throw new Error(`Erro ao exportar ${VIEW_LABELS[targetView] || targetView} da peça "${garment.name}": ${imageError.message}`);
        }
        if (blob) finalImages[targetView] = await uploadFinalRender(blob, user.uid, `${targetView}-${garmentId}`);
      }
      const effectiveColors = Object.fromEntries((garment.regions ?? []).map((region) => [region.id, colorChoices[region.id] ?? region.defaultColor]));
      const compactGrid = cleanSizeGrid(sizeGrid);
      const normalizedSizeScale = normalizeSizeScale(garment.sizeScale);
      const firstFinalImage = Object.values(finalImages).find(Boolean) || '';
      if (checkoutMode === 'cart') {
        addPieceToCart(staffUser?.uid, {
          garmentId,
          garmentName: garment.name,
          quantity: parsedQuantity,
          sizeScale: normalizedSizeScale,
          sizeGrid: compactGrid,
          colorChoices: effectiveColors,
          logos,
          texts,
          finalImages,
          finalImageUrl: firstFinalImage,
        });
        setCheckoutOpen(false);
        setMessage('Peça adicionada ao pedido. Escolha a próxima no catálogo.');
        navigate('/vendedor');
        return;
      }
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
        texts,
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
        texts,
        sizeGrid: compactGrid,
        quantity: parsedQuantity,
      });

      setCheckoutOpen(false);
      setOrderId(id);
      setMessage('Pedido registrado. Abrindo a ficha técnica para preenchimento…');
      navigate(`/ficha-tecnica/${id}`, { replace: true });
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
  const preflight = [
    ['Cores definidas', colorsReady],
    ['Layout livre revisado', true],
    ['Fotos da peça carregadas', views.length > 0],
  ];
  const preflightDone = preflight.filter(([, ok]) => ok).length;

  return (
    <main className="app-shell customer-shell">
      <div className="martinpel-appbar customer-brandbar seller-brandbar">
        <MartinpelBrand compact subtitle="Atendimento de venda" />
        <div className="seller-global-actions">
          <div className="seller-session compact"><span>Vendedor</span><strong>{staffUser?.email || 'Equipe Koleni'}</strong></div>
          <Link className="button button-light back-to-catalog" to="/vendedor">← Catálogo {readPieceCart(staffUser?.uid).length ? `(${readPieceCart(staffUser?.uid).length} no pedido)` : ''}</Link>
          <button className="button admin-logout-button" type="button" onClick={logout}>Sair</button>
        </div>
      </div>

      <div className="customer-flow-strip" aria-label="Etapas da personalização">
        <div className="is-active"><span>1</span><strong>Cores</strong><small>Escolha as áreas</small></div>
        <div className={(logos.length + texts.length) > 0 ? 'is-active' : ''}><span>2</span><strong>Arte livre</strong><small>Logo, nome e número</small></div>
        <div className={preflightDone === preflight.length ? 'is-active' : ''}><span>3</span><strong>Conferir</strong><small>Validação local</small></div>
        <div className={orderId ? 'is-active' : ''}><span>4</span><strong>Pedido</strong><small>Registrar atendimento</small></div>
      </div>

      <header className="customer-header martinpel-page-header customer-piece-header">
        <div className="page-heading-block">
          <p className="eyebrow">Montagem do pedido</p>
          <h1>{garment.name}</h1>
          <p className="page-subtitle">Cada foto é uma vista livre da mesma peça. Personalize cada uma conforme necessário.</p>
        </div>
        <div className="customer-view-tabs">
          {views.map((targetView) => <button key={targetView} type="button" className={view === targetView ? 'active' : ''} onClick={() => { setView(targetView); setSelectedRegionId(null); }}>{VIEW_LABELS[targetView]}</button>)}
        </div>
      </header>

      <div className="design-history-toolbar panel">
        <button type="button" className="button button-secondary" onClick={undoDesign} disabled={undoStackRef.current.length === 0}>↶ Desfazer</button>
        <button type="button" className="button button-secondary" onClick={redoDesign} disabled={redoStackRef.current.length === 0}>↷ Refazer</button>
        <span>Ctrl+Z / Ctrl+Y · movimentos, tamanhos, remoções, tratamentos e cores</span>
      </div>

      {(message || error) && <div className={error ? 'notice notice-error' : 'notice notice-success'}>{error || message}{orderId && <strong className="order-code"> Código: {orderId}</strong>}</div>}

      {orderId && !error && (
        <section className="panel post-order-actions">
          <div>
            <p className="eyebrow">Pedido registrado</p>
            <strong>Preencha agora a ficha técnica deste pedido</strong>
            <span>O desenho da peça e a tabela de medidas já entram automaticamente; o cabeçalho fica livre para você preencher.</span>
          </div>
          <div>
            <Link className="button button-primary" to={`/ficha-tecnica/${orderId}`}>Abrir ficha técnica</Link>
            <Link className="button button-secondary" to="/meus-pedidos">Ir para meus pedidos</Link>
          </div>
        </section>
      )}

      <section className="customer-layout customer-workspace">
        <section className="panel customer-stage-panel">
          <CustomerStage
            ref={stageRef}
            garment={garment}
            view={view}
            colorChoices={colorChoices}
            onRegionClick={selectRegion}
            onLogosChange={setLogos}
            onTextsChange={setTexts}
            onHistoryAction={recordStageAction}
          />
        </section>

        <aside className="panel customer-tools customer-tools-v2">
          <div className="customer-tools-head"><div><p className="eyebrow">Personalização</p><h2>Monte sua peça</h2></div><span className="customer-tools-badge">{logos.length + texts.length} item(ns)</span></div>
          <p className="customer-help">Logo e texto ficam totalmente livres no preview: arraste, gire e redimensione diretamente sobre a peça.</p>

          <div className="customer-tool-section-title"><span>01</span><strong>Cores da peça</strong></div>
          <div className="region-choice-list">
            {regionsInView.map((region) => (
              <button key={region.id} type="button" className={`region-choice ${selectedRegionId === region.id ? 'active' : ''} ${region.locked ? 'locked' : ''}`} onClick={() => selectRegion(region)} disabled={region.locked}>
                <span className="color-dot" style={{ background: colorChoices[region.id] ?? region.defaultColor }} /><span>{region.label}</span>{region.locked && <small>🔒</small>}
              </button>
            ))}
          </div>
          {selectedRegion && !selectedRegion.locked && (
            <div className="selected-color-box color-box-v2">
              <label>Cor de {selectedRegion.label}<input type="color" value={colorChoices[selectedRegion.id] ?? selectedRegion.defaultColor} onChange={(event) => setColorWithHistory(selectedRegion.id, event.target.value)} /></label>
              <div className="quick-color-palette">{COLOR_PRESETS.map((color) => <button key={color} type="button" title={color} style={{ background: color }} onClick={() => setColorWithHistory(selectedRegion.id, color)} />)}</div>
              <button type="button" className="mini-link" onClick={() => resetRegionColor(selectedRegion.id)}>Voltar à cor padrão</button>
            </div>
          )}

          <div className="tool-divider" />
          <div className="customer-tool-section-title"><span>02</span><strong>Logo livre</strong></div>
          <input ref={fileInputRef} className="sr-only" type="file" accept="image/png,image/jpeg,image/webp,application/pdf,.pdf" onChange={(event) => handleLogo(event.target.files?.[0])} />
          <button type="button" className="button button-primary full-width" disabled={busy} onClick={() => fileInputRef.current?.click()}>+ Adicionar logo</button>
          <p className="logo-upload-help">PNG, JPG, WEBP ou PDF. Arquivos iguais são reaproveitados pela biblioteca.</p>
          {pdfLibrary && <PdfLogoLibrary fileName={pdfLibrary.fileName} pages={pdfLibrary.pages} pageCount={pdfLibrary.pageCount} currentView={view} busyPage={pdfBusyPage} onAddPage={addPdfPage} onAddAll={addAllPdfPages} onClose={closePdfLibrary} />}

          <button
            type="button"
            className={`logo-manager-toggle ${logoManagerOpen ? 'is-open' : ''}`}
            onClick={() => setLogoManagerOpen((open) => !open)}
            aria-expanded={logoManagerOpen}
          >
            <span className="logo-manager-toggle-icon">▦</span>
            <span className="logo-manager-toggle-copy">
              <strong>Gerenciar logos</strong>
              <small>{logos.length ? `${logos.length} logo(s) usada(s) nesta peça` : 'Nenhuma logo adicionada'}</small>
            </span>
            <b>{logoManagerOpen ? '−' : '+'}</b>
          </button>

          {logoManagerOpen && (
            <LogoManager
              logos={logos}
              currentView={view}
              viewLabels={VIEW_LABELS}
              onSelect={selectManagedLogo}
              onRemove={removeManagedLogo}
            />
          )}

          <button type="button" className="button button-background-local full-width" disabled={busy || logos.length === 0} onClick={openBackgroundRemoval}>✦ Remover fundo da logo</button>
          <button type="button" className="button button-logo-color full-width" disabled={busy || logos.length === 0} onClick={openLogoColorEditor}>🎨 Editar cor da logo</button>

          <LogoColorEditor
            open={logoColorEditorOpen}
            fileName={logoColorTarget?.sourceName}
            color={logoEditColor}
            mode={logoEditMode}
            opacity={logoEditOpacity}
            busy={logoColorApplying}
            onColorChange={setLogoEditColor}
            onModeChange={setLogoEditMode}
            onOpacityChange={setLogoEditOpacity}
            onApply={applyLogoColor}
            onRestore={restoreLogoColor}
            onClose={() => {
              if (!logoColorApplying) {
                setLogoColorEditorOpen(false);
                setLogoColorTarget(null);
              }
            }}
          />

          <div className="tool-divider" />
          <div className="customer-tool-section-title"><span>03</span><strong>Nome, número ou texto</strong></div>
          <button type="button" className={`text-tool-toggle ${textPanelOpen ? 'is-open' : ''}`} onClick={() => setTextPanelOpen((open) => !open)} aria-expanded={textPanelOpen}>
            <span className="text-tool-toggle-icon">Aa</span>
            <span className="text-tool-toggle-copy"><strong>Colocar nome / número</strong><small>Fonte, estilo, tamanho e cores</small></span>
            <b>{textPanelOpen ? '−' : '+'}</b>
          </button>

          {textPanelOpen && (
            <div className="text-customization-card">
              <label className="text-main-field">Texto
                <input value={textDraft} onChange={(event) => setTextDraft(event.target.value)} placeholder="Ex.: JOÃO · 10 · FINANCEIRO" />
              </label>

              <div className="text-options-grid">
                <label>Fonte
                  <select value={textFontFamily} onChange={(event) => setTextFontFamily(event.target.value)}>
                    {TEXT_FONT_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                <label>Peso
                  <select value={textFontWeight} onChange={(event) => setTextFontWeight(event.target.value)}>
                    <option value="400">Normal</option>
                    <option value="700">Negrito</option>
                    <option value="900">Extra forte</option>
                  </select>
                </label>
                <label>Estilo
                  <select value={textFontStyle} onChange={(event) => setTextFontStyle(event.target.value)}>
                    <option value="normal">Normal</option>
                    <option value="italic">Itálico</option>
                  </select>
                </label>
                <label>Tamanho inicial
                  <select value={textInitialScale} onChange={(event) => setTextInitialScale(event.target.value)}>
                    {TEXT_SIZE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
              </div>

              <div className="text-appearance-row">
                <label className="text-color-option">Cor da letra<input type="color" value={textColor} onChange={(event) => setTextColor(event.target.value)} /></label>
                <label className="text-color-option">Fundo da etiqueta<input type="color" value={textBackgroundColor} onChange={(event) => setTextBackgroundColor(event.target.value)} /></label>
                <label className="text-uppercase-option" style={{ gridColumn: '1 / -1' }}><input type="checkbox" checked={textUppercase} onChange={(event) => setTextUppercase(event.target.checked)} /><span>CAIXA ALTA</span></label>
              </div>

              <div className="text-style-preview">
                <span>Prévia</span>
                <strong style={{
                  color: textColor,
                  backgroundColor: textBackgroundColor,
                  fontFamily: textFontFamily,
                  fontWeight: textFontWeight,
                  fontStyle: textFontStyle,
                  padding: '8px 12px',
                  border: '1px solid rgba(15,23,42,.18)',
                  borderRadius: '2px',
                  alignSelf: 'flex-start',
                }}>{textPreview}</strong>
              </div>

              <button type="button" className="button button-secondary full-width" onClick={addText}>Adicionar na camisa</button>
              <p className="logo-upload-help">Depois de inserir, dê duplo clique para editar o conteúdo e use os controles da peça para mover, girar e redimensionar.</p>
            </div>
          )}

          <button type="button" className="button button-secondary full-width" disabled={busy || (logos.length + texts.length === 0)} onClick={removeSelectedItem}>Remover item selecionado</button>
          <div className="logo-count">{logos.length} logo(s) · {texts.length} texto(s)</div>

          <div className="tool-divider" />
          <div className="customer-tool-section-title"><span>04</span><strong>Conferência automática</strong></div>
          <div className="seller-preflight">
            <div className="seller-preflight-head"><strong>{preflightDone}/{preflight.length} verificações</strong><span>{preflightDone === preflight.length ? 'Pronto para registrar' : 'Revise antes do pedido'}</span></div>
            {preflight.map(([label, ok]) => <div className={ok ? 'ok' : ''} key={label}><span>{ok ? '✓' : '!'}</span><strong>{label}</strong></div>)}
          </div>

          <button type="button" className="button button-success finalize-button" disabled={busy} onClick={() => openCheckout('single')}>{busy ? 'Processando…' : 'Registrar pedido desta peça'}</button>
          <button type="button" className="button button-primary full-width" disabled={busy} onClick={() => openCheckout('cart')}>+ Adicionar ao pedido com várias peças</button>
          <p className="download-help">Adicione uma peça, volte ao catálogo e personalize as próximas. Finalize todas juntas em um único pedido.</p>
          <button type="button" className="button button-secondary full-width download-final-button" disabled={busy} onClick={downloadCurrentImage}>Baixar imagem pronta · {VIEW_LABELS[view]}</button>
          {views.length > 1 && <p className="download-help">Troque entre as fotos para baixar cada layout separadamente.</p>}
        </aside>
      </section>

      <BackgroundRemovalDialog open={Boolean(backgroundToolLogo)} source={backgroundToolLogo?.processingSource || backgroundToolLogo?.originalUrl || backgroundToolLogo?.sourceUrl} cacheKey={backgroundToolLogo?.originalUrl || backgroundToolLogo?.sourceUrl || backgroundToolLogo?.storageUrl} fileName={backgroundToolLogo?.sourceName} onCancel={() => { if (!backgroundApplying) setBackgroundToolLogo(null); }} onApply={applyBackgroundRemoval} />

      {checkoutOpen && (
        <div className="checkout-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeCheckout(); }}>
          <form className="panel checkout-card checkout-card-wide" onSubmit={handleCheckoutSubmit}>
            <div><p className="eyebrow">{checkoutMode === 'cart' ? 'Adicionar ao pedido' : 'Registrar pedido'}</p><h2>{checkoutMode === 'cart' ? `Quantidade e tamanhos · ${garment.name}` : 'Cliente e grade de produção'}</h2><p className="muted checkout-intro">{checkoutMode === 'cart' ? 'Esta personalização será guardada no pedido em montagem. Você informa o cliente uma única vez ao finalizar no catálogo.' : 'Localize um cliente recorrente pelo WhatsApp ou registre um novo atendimento.'}</p></div>

            {checkoutMode === 'single' && (<>
            <div className="customer-lookup-row">
              <label>WhatsApp<input type="tel" value={customerWhatsapp} onChange={(event) => { setCustomerWhatsapp(event.target.value); setCustomerRecord(null); }} placeholder="Ex.: (62) 99999-9999" autoComplete="tel" disabled={busy} /></label>
              <button type="button" className="button button-secondary" onClick={lookupCustomer} disabled={busy || customerLookupBusy}>{customerLookupBusy ? 'Buscando…' : 'Buscar cadastro'}</button>
            </div>

            {customerRecord && (
              <div className="customer-found-card">
                <div><span>Cliente recorrente</span><strong>{customerRecord.name || 'Cliente cadastrado'}</strong><small>{customerRecord.orderCount || 0} pedido(s) registrado(s)</small></div>
                {customerRecord.lastOrderTemplate && <button type="button" className="button button-secondary" onClick={reuseLastOrder} disabled={busy}>Repetir último pedido</button>}
              </div>
            )}

            <label>Nome do cliente<input autoFocus value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Nome / empresa" autoComplete="name" disabled={busy} /></label>

            </>)}

            <div className="size-grid-editor">
              <div className="size-grid-title"><strong>Grade de tamanhos</strong><span>{getSizeScaleLabel(garment.sizeScale)} · Total pela grade: {sizeTotal}</span></div>
              <div className="size-grid-inputs">
                {sizeLabels.map((size) => <label key={size}><span>{size}</span><input type="number" min="0" step="1" value={sizeGrid[size] ?? 0} onChange={(event) => setSizeGrid((current) => ({ ...current, [size]: Math.max(0, Number(event.target.value) || 0) }))} disabled={busy} /></label>)}
              </div>
            </div>

            <label>Quantidade total <span className="optional-label">(use apenas se não preencher a grade)</span><input type="number" min="1" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="Ex.: 20" disabled={busy || sizeTotal > 0} /></label>

            {checkoutError && <div className="checkout-error">
              {checkoutError}
              {/cors|exporta|origem:/i.test(checkoutError) && <a
                href="https://console.cloud.google.com/storage/browser/personalizakoleni.firebasestorage.app?project=personalizakoleni"
                target="_blank" rel="noreferrer"
                style={{ display: 'block', marginTop: 10, color: 'inherit', textDecoration: 'underline', fontWeight: 800 }}
              >Abrir configuração do Storage da Koleni ↗</a>}
            </div>}
            <div className="checkout-actions"><button type="button" className="button button-secondary" onClick={closeCheckout} disabled={busy}>Cancelar</button><button type="submit" className="button button-success" disabled={busy}>{busy ? 'Processando…' : checkoutMode === 'cart' ? `Adicionar ${sizeTotal || Number(quantity) || 0} peça(s) ao pedido` : `Confirmar pedido · ${sizeTotal || Number(quantity) || 0} peça(s)`}</button></div>
          </form>
        </div>
      )}
    </main>
  );
}
