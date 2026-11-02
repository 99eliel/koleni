import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import CustomerStage from '../components/CustomerStage';
import MartinpelBrand from '../components/MartinpelBrand';
import PdfLogoLibrary from '../components/PdfLogoLibrary';
import { getGarment } from '../lib/garmentRepo';
import { getOrderForRevision, saveOrderRevision } from '../lib/orderRepo';
import { renderPdfLogoPreviews } from '../lib/pdfLogoPreview';
import { uploadClientLogo, uploadClientLogoOriginalPdf, uploadFinalRender } from '../lib/storageImages';
import '../customer.css';
import '../revision.css';

const VIEW_LABELS = { front: 'Foto 1', back: 'Foto 2', combined: 'Foto 3' };
const COLOR_PRESETS = ['#ffffff', '#111827', '#0b2b52', '#2563eb', '#dc2626', '#16a34a', '#facc15', '#9ca3af'];

function availableViews(garment) {
  return ['front', 'back', 'combined'].filter((key) => garment?.images?.[key]);
}

function approvalUrl(orderId, token) {
  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}#/aprovar/${orderId}/${token}`;
}

export default function OrderRevisionPage({ user, isAdmin = false, logout }) {
  const { orderId } = useParams();
  const stageRef = useRef(null);
  const fileInputRef = useRef(null);
  const restoredRef = useRef(false);
  const undoStackRef = useRef([]);
  const redoStackRef = useRef([]);
  const suppressHistoryRef = useRef(false);
  const [historyTick, setHistoryTick] = useState(0);
  const [order, setOrder] = useState(null);
  const [garment, setGarment] = useState(null);
  const [view, setView] = useState('front');
  const [selectedRegionId, setSelectedRegionId] = useState(null);
  const [colorChoices, setColorChoices] = useState({});
  const [logos, setLogos] = useState([]);
  const [texts, setTexts] = useState([]);
  const [textDraft, setTextDraft] = useState('');
  const [textColor, setTextColor] = useState('#111827');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [pdfLibrary, setPdfLibrary] = useState(null);
  const [pdfBusyPage, setPdfBusyPage] = useState(null);
  const [newApproval, setNewApproval] = useState(null);

  const selectedRegion = useMemo(
    () => garment?.regions?.find((region) => region.id === selectedRegionId) ?? null,
    [garment, selectedRegionId],
  );
  const views = useMemo(() => availableViews(garment), [garment]);
  const regionsInView = useMemo(
    () => (garment?.regions ?? []).filter((region) => region.view === view).sort((a, b) => (b.zIndex ?? 0) - (a.zIndex ?? 0)),
    [garment, view],
  );

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
    let active = true;
    setLoading(true);
    getOrderForRevision(orderId)
      .then(async (orderData) => {
        if (!active) return;
        if (!orderData) throw new Error('Pedido não encontrado ou sem permissão para revisão.');
        const garmentData = await getGarment(orderData.garmentId);
        if (!garmentData) throw new Error('A peça original deste pedido não está mais disponível no catálogo.');
        if (!active) return;
        setOrder(orderData);
        setGarment(garmentData);
        setColorChoices(orderData.colorChoices || {});
        setView(availableViews(garmentData)[0] || 'front');
      })
      .catch((err) => active && setError(err.message))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [orderId]);

  useEffect(() => {
    if (!order || !garment || restoredRef.current || !stageRef.current) return;
    restoredRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        await stageRef.current.restoreDesignState({ logos: order.logos || [], texts: order.texts || [] }, { resetHistory: true });
        if (!cancelled) resetHistory();
      } catch (err) {
        if (!cancelled) setError(`Não foi possível restaurar toda a versão anterior: ${err.message}`);
      }
    })();
    return () => { cancelled = true; };
  }, [order, garment]);

  function selectRegion(region) {
    if (!region.locked) setSelectedRegionId(region.id);
  }

  function removeSelectedItem() {
    const removed = stageRef.current?.removeSelectedItem?.();
    setMessage(removed ? 'Item selecionado removido.' : 'Clique primeiro em uma logo ou texto para remover.');
  }

  function addText() {
    const clean = textDraft.trim();
    if (!clean) return setError('Digite um nome, número ou texto para adicionar.');
    stageRef.current?.addText(clean, { color: textColor, targetView: view, fontWeight: '700' });
    setTextDraft('');
    setError('');
    setMessage('Texto adicionado. Arraste, gire e redimensione livremente na peça.');
  }

  function releasePdfLibrary(library = pdfLibrary) {
    library?.pages?.forEach((page) => page.previewUrl && URL.revokeObjectURL(page.previewUrl));
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
    const storageUrl = await uploadClientLogo(page.previewFile, user.uid);
    setPdfLibrary((current) => current ? {
      ...current,
      pages: current.pages.map((item) => item.pageNumber === pageNumber ? { ...item, storageUrl } : item),
    } : current);
    return storageUrl;
  }

  async function addPdfPage(pageNumber) {
    if (!pdfLibrary) return;
    setPdfBusyPage(pageNumber);
    setError('');
    try {
      const storageUrl = await ensurePdfPageStorageUrl(pageNumber);
      await stageRef.current?.addLogo(storageUrl, {
        sourceUrl: pdfLibrary.originalUrl,
        originalUrl: pdfLibrary.originalUrl,
        sourceName: pdfLibrary.fileName,
        sourceType: 'pdf',
        sourcePage: pageNumber,
        sourcePageCount: pdfLibrary.pageCount,
        targetView: view,
      });
      setMessage(`Página ${pageNumber} adicionada à nova versão.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setPdfBusyPage(null);
    }
  }

  async function addAllPdfPages() {
    for (const page of pdfLibrary?.pages || []) await addPdfPage(page.pageNumber);
  }

  async function handleLogo(file) {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const isPdf = file.type === 'application/pdf' || file.name?.toLowerCase().endsWith('.pdf');
      if (isPdf) {
        releasePdfLibrary();
        const originalUrl = await uploadClientLogoOriginalPdf(file, user.uid);
        const { pages, pageCount } = await renderPdfLogoPreviews(file);
        setPdfLibrary({
          fileName: file.name,
          originalUrl,
          pageCount,
          pages: pages.map((page) => ({ ...page, previewUrl: URL.createObjectURL(page.previewFile), storageUrl: '' })),
        });
        setMessage(`PDF carregado com ${pageCount} página(s). Escolha o que entra na nova versão.`);
      } else {
        const url = await uploadClientLogo(file, user.uid);
        await stageRef.current?.addLogo(url, {
          sourceUrl: url,
          originalUrl: url,
          sourceName: file.name,
          sourceType: 'image',
          sourcePage: 1,
          sourcePageCount: 1,
          targetView: view,
        });
        setMessage('Nova logo adicionada à revisão. Movimente e redimensione livremente.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function saveRevision() {
    if (!order || !garment) return;
    if (order.approvalStatus !== 'changes_requested') {
      setError('Este pedido não está aguardando uma correção solicitada pelo cliente.');
      return;
    }
    setBusy(true);
    setError('');
    setMessage('Gerando nova versão da arte…');
    try {
      const finalImages = {};
      for (const targetView of availableViews(garment)) {
        const blob = await stageRef.current?.exportView(targetView);
        if (blob) finalImages[targetView] = await uploadFinalRender(blob, user.uid, `${targetView}-${order.garmentId}-v${(order.designVersion || 1) + 1}`);
      }
      const effectiveColors = Object.fromEntries((garment.regions ?? []).map((region) => [region.id, colorChoices[region.id] ?? region.defaultColor]));
      const firstFinalImage = Object.values(finalImages).find(Boolean) || '';
      const result = await saveOrderRevision(order.id, {
        colorChoices: effectiveColors,
        logos,
        texts,
        finalImages,
        finalImageUrl: firstFinalImage,
      });
      setNewApproval(result);
      setOrder((current) => ({
        ...current,
        colorChoices: effectiveColors,
        logos,
        texts,
        finalImages,
        finalImageUrl: firstFinalImage,
        designVersion: result.designVersion,
        approvalToken: result.approvalToken,
        approvalStatus: 'pending',
        approvalNote: '',
        status: 'approval',
      }));
      setMessage(`Versão ${result.designVersion} criada. O cliente já pode receber o novo link.`);
    } catch (err) {
      setError(err.message || 'Não foi possível salvar a nova versão.');
      setMessage('');
    } finally {
      setBusy(false);
    }
  }

  async function copyNewLink() {
    if (!newApproval) return;
    const url = approvalUrl(order.id, newApproval.approvalToken);
    try {
      await navigator.clipboard.writeText(url);
      setMessage('Link da nova versão copiado.');
    } catch {
      window.prompt('Copie o link de aprovação:', url);
    }
  }

  function sendWhatsApp() {
    if (!newApproval) return;
    const number = String(order.whatsapp || '').replace(/\D/g, '');
    const url = approvalUrl(order.id, newApproval.approvalToken);
    const text = `Olá! A versão V${newApproval.designVersion} da arte do pedido ${order.displayCode || order.id} está pronta para nova conferência.\n\nAcesse para aprovar ou solicitar outra alteração:\n${url}`;
    const target = number ? `https://wa.me/55${number.replace(/^55/, '')}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(target, '_blank', 'noopener,noreferrer');
  }

  if (loading) return <main className="loading-screen">Carregando revisão do pedido…</main>;
  if (!order || !garment) return <main className="loading-screen"><div><p>{error || 'Pedido indisponível.'}</p><Link to={isAdmin ? '/admin' : '/meus-pedidos'}>Voltar</Link></div></main>;

  return (
    <main className="app-shell customer-shell revision-shell">
      <div className="martinpel-appbar customer-brandbar seller-brandbar">
        <MartinpelBrand compact subtitle={`Revisão ${order.displayCode || order.id}`} />
        <div className="seller-global-actions">
          <Link className="button button-light" to={isAdmin ? '/admin' : '/meus-pedidos'}>← Voltar aos pedidos</Link>
          <button className="button admin-logout-button" type="button" onClick={logout}>Sair</button>
        </div>
      </div>

      <section className="revision-request panel">
        <div>
          <p className="eyebrow">Solicitação do cliente · V{order.designVersion || 1}</p>
          <h1>{order.approvalNote || 'Cliente solicitou uma alteração na arte.'}</h1>
          <p>Faça os ajustes abaixo e gere a próxima versão mantendo o mesmo pedido {order.displayCode || order.id}.</p>
        </div>
        <span>Próxima: V{(order.designVersion || 1) + 1}</span>
      </section>

      {(message || error) && <div className={error ? 'notice notice-error' : 'notice notice-success'}>{error || message}</div>}

      {newApproval ? (
        <section className="panel revision-ready-card">
          <div><p className="eyebrow">Nova aprovação</p><h2>V{newApproval.designVersion} pronta para o cliente</h2><p>O link anterior não aprova esta nova versão.</p></div>
          <div className="revision-ready-actions">
            <button className="button button-secondary" type="button" onClick={copyNewLink}>Copiar link</button>
            <button className="button button-success" type="button" onClick={sendWhatsApp}>Enviar V{newApproval.designVersion} pelo WhatsApp</button>
          </div>
        </section>
      ) : (
        <>
          <header className="customer-header martinpel-page-header customer-piece-header">
            <div className="page-heading-block"><p className="eyebrow">Corrigir arte</p><h1>{garment.name}</h1><p className="page-subtitle">Ajuste somente o necessário e envie uma nova versão para aprovação.</p></div>
            <div className="customer-view-tabs">{views.map((targetView) => <button key={targetView} type="button" className={view === targetView ? 'active' : ''} onClick={() => { setView(targetView); setSelectedRegionId(null); }}>{VIEW_LABELS[targetView]}</button>)}</div>
          </header>

          <div className="design-history-toolbar panel">
            <button type="button" className="button button-secondary" onClick={undoDesign} disabled={undoStackRef.current.length === 0}>↶ Desfazer</button>
            <button type="button" className="button button-secondary" onClick={redoDesign} disabled={redoStackRef.current.length === 0}>↷ Refazer</button>
            <span>Ctrl+Z / Ctrl+Y · {historyTick >= 0 ? 'histórico local desta edição' : ''}</span>
          </div>

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
              <div className="customer-tools-head"><div><p className="eyebrow">Versão {(order.designVersion || 1) + 1}</p><h2>Ajustar personalização</h2></div><span className="customer-tools-badge">{logos.length + texts.length} item(ns)</span></div>

              <div className="customer-tool-section-title"><span>01</span><strong>Cores da peça</strong></div>
              <div className="region-choice-list">{regionsInView.map((region) => <button key={region.id} type="button" className={`region-choice ${selectedRegionId === region.id ? 'active' : ''} ${region.locked ? 'locked' : ''}`} onClick={() => selectRegion(region)} disabled={region.locked}><span className="color-dot" style={{ background: colorChoices[region.id] ?? region.defaultColor }} /><span>{region.label}</span></button>)}</div>
              {selectedRegion && !selectedRegion.locked && (
                <div className="selected-color-box color-box-v2">
                  <label>Cor de {selectedRegion.label}<input type="color" value={colorChoices[selectedRegion.id] ?? selectedRegion.defaultColor} onChange={(event) => setColorWithHistory(selectedRegion.id, event.target.value)} /></label>
                  <div className="quick-color-palette">{COLOR_PRESETS.map((color) => <button key={color} type="button" title={color} style={{ background: color }} onClick={() => setColorWithHistory(selectedRegion.id, color)} />)}</div>
                </div>
              )}

              <div className="tool-divider" />
              <div className="customer-tool-section-title"><span>02</span><strong>Logo livre</strong></div>
              <input ref={fileInputRef} className="sr-only" type="file" accept="image/png,image/jpeg,image/webp,application/pdf,.pdf" onChange={(event) => handleLogo(event.target.files?.[0])} />
              <button type="button" className="button button-primary full-width" disabled={busy} onClick={() => fileInputRef.current?.click()}>+ Adicionar logo</button>
              <p className="logo-upload-help">A logo fica totalmente livre: arraste, gire e redimensione direto sobre a peça.</p>
              {pdfLibrary && <PdfLogoLibrary fileName={pdfLibrary.fileName} pages={pdfLibrary.pages} pageCount={pdfLibrary.pageCount} currentView={view} busyPage={pdfBusyPage} onAddPage={addPdfPage} onAddAll={addAllPdfPages} onClose={closePdfLibrary} />}

              <div className="tool-divider" />
              <div className="customer-tool-section-title"><span>03</span><strong>Nome, número ou texto</strong></div>
              <div className="text-design-editor">
                <input value={textDraft} onChange={(event) => setTextDraft(event.target.value)} placeholder="Ex.: JOÃO · 10 · FINANCEIRO" />
                <input type="color" value={textColor} onChange={(event) => setTextColor(event.target.value)} title="Cor do texto" />
                <button type="button" className="button button-secondary" onClick={addText}>Adicionar texto</button>
              </div>
              <p className="logo-upload-help">Depois de inserir, o texto também pode ser movido, girado, redimensionado e editado com duplo clique.</p>

              <button type="button" className="button button-secondary full-width" disabled={busy || (logos.length + texts.length === 0)} onClick={removeSelectedItem}>Remover item selecionado</button>

              <div className="tool-divider" />
              <button type="button" className="button button-success finalize-button" disabled={busy} onClick={saveRevision}>{busy ? 'Gerando nova versão…' : `Salvar V${(order.designVersion || 1) + 1} e gerar novo link`}</button>
            </aside>
          </section>
        </>
      )}
    </main>
  );
}