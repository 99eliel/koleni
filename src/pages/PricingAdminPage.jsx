import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../lib/firebase';
import { parseKoleniHtmlPricing } from '../lib/pricingHtmlImport';
import AdminAuth from '../components/AdminAuth';
import MartinpelBrand from '../components/MartinpelBrand';
import {
  cleanConfig, DEFAULT_CONFIG, exportLegacyTable, importLegacyCatalog,
  loadPricingCatalog, migrateLegacyPricing, normalizeProduct, removeProduct,
  saveGlobalPricing, saveJsonDownload, saveProduct, validateProduct, priceCodesForConfig,
} from '../lib/pricingCatalog';
import '../pricing-admin.css';

const money = (cents) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((Number(cents) || 0) / 100);
const groups = [['N', 'Sem aplicação'], ['S', 'Silk'], ['D', 'DTF'], ['B', 'Bordado']];
const prettyCode = (code) => {
  if (code === 'N') return 'Peça lisa · sem personalização';
  if (code[0] === 'S') return `Silk · ${code[1]} posição(ões) · tamanho ${code[2]} · ${code[3]} cor(es) · ${code[4] === '1' ? 'arte complexa' : 'arte simples'} · ${code[5] === '1' ? 'tela nova' : 'tela existente'}`;
  if (code[0] === 'B') return `Bordado · ${code[1]} posição(ões) · tamanho ${code[2]} · ${code[3] === '1' ? 'matriz nova' : 'matriz existente'}`;
  if (code[0] === 'D') return `DTF · ${code[1]} posição(ões) · tamanho ${code[2]}`;
  return code;
};
const isoDay = () => new Date().toISOString().slice(0, 10);
const copyJson = (obj) => JSON.parse(JSON.stringify(obj));

function PricingAdminContent({ user, logout }) {
  const fileInputRef = useRef(null);
  const [loaded, setLoaded] = useState(false);
  const [data, setData] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [original, setOriginal] = useState(null);
  const [mode, setMode] = useState('products');
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(true);
  const [group, setGroup] = useState('N');
  const [codeSearch, setCodeSearch] = useState('');
  const [settings, setSettings] = useState(DEFAULT_CONFIG);
  const [tiersText, setTiersText] = useState(DEFAULT_CONFIG.qs.join(', '));
  const [busy, setBusy] = useState(false);
  const [photo, setPhoto] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const dirty = !!draft && JSON.stringify(draft) !== JSON.stringify(original);

  async function load(preferredId = null) {
    setError('');
    try {
      const current = await loadPricingCatalog();
      setData(current);
      setSettings(copyJson(current.config));
      setTiersText(current.config.qs.join(', '));
      const selected = current.products.find((p) => p.id === preferredId)
        || current.products.find((p) => p.id === selectedId)
        || current.products[0] || null;
      setDraft(selected ? copyJson(selected) : null);
      setOriginal(selected ? copyJson(selected) : null);
      setSelectedId(selected?.id || null);
      setPhoto(null);
    } catch (err) { setError(`Não foi possível acessar o cadastro: ${err.message}`); }
    finally { setLoaded(true); }
  }
  useEffect(() => { load(); }, []);
  function clearNotice() { setError(''); setSuccess(''); }
  function allowDiscard() { return !dirty && !photo || window.confirm('Existem alterações não salvas. Descartar as alterações?'); }
  function chooseProduct(p) {
    if (!allowDiscard()) return;
    setSelectedId(p.id); setDraft(copyJson(p)); setOriginal(copyJson(p)); setPhoto(null); setMode('products'); clearNotice();
  }
  function update(field, value) { setDraft((prev) => ({ ...prev, [field]: value })); clearNotice(); }
  function patchPrice(code, index, reais) {
    const cents = reais === '' ? 0 : Math.round(Number(reais) * 100);
    if (!Number.isFinite(cents) || cents < 0 || cents > 999999999) return;
    setDraft((prev) => ({ ...prev, prices: {
      ...prev.prices, [code]: prev.prices[code].map((v, i) => i === index ? cents : v),
    } }));
  }
  function createFrom(reference = null) {
    if (!allowDiscard()) return;
    const source = reference || draft || data.products[0];
    if (!source) return setError('Importe a tabela de preços primeiro, para criar uma peça com todas as regras de aplicação.');
    const empty = normalizeProduct({
      name: '', active: false, category: source.category,
      sortOrder: data.products.length,
      prices: copyJson(source.prices),
      belowMinFactor: source.belowMinFactor,
      setupDivisors: copyJson(source.setupDivisors),
    }, crypto.randomUUID());
    setDraft(empty); setOriginal(null); setSelectedId(empty.id); setPhoto(null); setMode('products'); setGroup('N'); clearNotice();
    setSuccess('Nova peça criada com a matriz de preços de referência. Revise cada técnica e seus valores antes de ativar.');
  }
  function duplicateSelected() {
    if (!draft) return;
    if (!allowDiscard()) return;
    const clone = normalizeProduct({ ...copyJson(draft), name: `${draft.name} — cópia`, active: false, sortOrder: data.products.length, imageUrl: '' }, crypto.randomUUID());
    setDraft(clone); setOriginal(null); setSelectedId(clone.id); setPhoto(null); clearNotice();
    setSuccess('Modelo duplicado. Ajuste os dados e preços, depois salve. Ele começará oculto para os vendedores.');
  }
  async function saveCurrent() {
    if (!draft || busy) return;
    setBusy(true); clearNotice();
    try {
      if (data.legacy) throw new Error('Ative o cadastro individual antes de editar.');
      if (data.products.some((p) => p.id !== draft.id && p.name.trim().toLocaleLowerCase('pt-BR') === draft.name.trim().toLocaleLowerCase('pt-BR'))) throw new Error('Já existe outra peça com este nome.');
      let entry = normalizeProduct(draft);
      if (entry.active) {
        validateProduct(entry, data.config.qs, priceCodesForConfig(data.config));
        if (data.config.pricingEngine === 'shared-setup-v3' &&
          (entry.setupDivisors.length !== data.config.qs.length || entry.setupDivisors.some((n)=>!(n>0)))) {
          throw new Error('Preencha os fatores de rateio por faixa antes de ativar a peça.');
        }
      }
      if (photo) {
        if (!photo.type.startsWith('image/') || photo.size > 5 * 1024 * 1024) throw new Error('Selecione uma imagem de até 5 MB.');
        const storagePath = `pricing-products/${entry.id}/${Date.now()}-${photo.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`;
        const uploaded = await uploadBytes(ref(storage, storagePath), photo, { contentType: photo.type });
        entry.imageUrl = await getDownloadURL(uploaded.ref);
      }
      await saveProduct(entry, user.uid);
      setSuccess('Dados e preços do modelo salvos no Firebase. A equipe verá a atualização ao abrir o simulador.');
      await load(entry.id);
    } catch (err) { setError(err.message || 'Falha ao salvar modelo.'); }
    finally { setBusy(false); }
  }
  async function deleteCurrent() {
    if (!draft || !data.products.some((p) => p.id === draft.id) || busy) return;
    if (!window.confirm(`Excluir permanentemente "${draft.name}" da tabela de preços? Orçamentos já salvos serão mantidos, mas esta peça não poderá mais ser simulada.`)) return;
    setBusy(true); clearNotice();
    try { await removeProduct(draft.id); setSelectedId(null); await load('none'); setSuccess('Peça excluída do cadastro de preços.'); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  function downloadBackup() {
    if (!data) return;
    saveJsonDownload(`backup-precificacao-koleni-${isoDay()}.json`, {
      ...exportLegacyTable(data.config, data.products),
      products: data.products,
      productMeta: data.products.map((p) => ({ ...p, prices: undefined })),
      deliveryDays: data.config.deliveryDays,
      validDays: data.config.validDays,
      artSizeCm: data.config.artSizeCm,
      backupVersion: 2,
    });
    setSuccess('Cópia de segurança baixada no navegador. Guarde este arquivo em local seguro; ele contém preços internos.');
  }
  async function migrate() {
    if (!data?.legacy || busy) return;
    if (!window.confirm('Transformar os modelos da tabela original em registros individuais editáveis? A precificação será mantida. Uma cópia de segurança será baixada primeiro.')) return;
    downloadBackup();
    setBusy(true); clearNotice();
    try { await migrateLegacyPricing(data.raw, user.uid); await load(); setSuccess('Catálogo individual ativado! Agora cada peça tem seu cadastro, técnicas e preços próprios.'); }
    catch (err) { setError(`A migração não foi concluída: ${err.message}`); }
    finally { setBusy(false); }
  }
  async function importJson(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || busy) return;
    setBusy(true); clearNotice();
    try {
      if (file.size > 10_000_000) throw new Error('Arquivo acima de 10 MB.');
      const content=await file.text();
      const parsed=/\.html?$/i.test(file.name)?parseKoleniHtmlPricing(content,file.name):JSON.parse(content);
      if (!Array.isArray(parsed.produtos) || !Array.isArray(parsed.p) || !parsed.qs) throw new Error('Arquivo não é uma tabela de preços Koleni.');
      const existing=data?.products||[];
      const oldNames=new Set(existing.map((item)=>item.name.trim().toLowerCase()));
      const newNames=new Set(parsed.produtos.map((name)=>name.trim().toLowerCase()));
      const added=parsed.produtos.filter((name)=>!oldNames.has(name.trim().toLowerCase())).length;
      const preserved=existing.filter((item)=>!newNames.has(item.name.trim().toLowerCase())).length;
      const warning=parsed.pricingEngine==='shared-setup-v3'
        ? '\nA nova tabela usa rateio por arte. Modelos antigos fora do arquivo podem ficar indisponíveis até receberem preços completos.' : '';
      if (!window.confirm(
        `CONFERIR ATUALIZAÇÃO – ${parsed.gerado || 'Koleni'}\n`+
        `${parsed.produtos.length} modelos (${added} novos; ${parsed.produtos.length-added} existentes).\n`+
        `${preserved} modelos antigos serão preservados.\n`+
        'Preços dos modelos com o mesmo nome serão substituídos.\n' +
        'Orçamentos anteriores permanecerão intactos.' + warning +
        '\n\nBaixar backup e publicar estes preços no Firebase?'
      )) return;
      if(data) downloadBackup();
      await importLegacyCatalog(parsed, data?.legacy ? [] : data?.products || [], user.uid, data?.legacy ? null : data?.config);
      await load(); setSuccess(`${parsed.produtos.length} modelos atualizados. Confira os valores no simulador.`);
    } catch (err) { setError(`Falha na importação: ${err.message}`); }
    finally { setBusy(false); }
  }
  async function saveSettings() {
    if (!data || busy || data.legacy) return;
    clearNotice();
    const qs = tiersText.split(/[;,\s]+/).filter(Boolean).map(Number);
    if (qs.length < 2 || qs.length > 16 || qs.some((n, i) => !Number.isInteger(n) || n < 1 || (i > 0 && n <= qs[i - 1]))) return setError('Informe de 2 a 16 faixas inteiras em ordem crescente, separadas por vírgula.');
    const changed = JSON.stringify(qs) !== JSON.stringify(data.config.qs);
    if (changed && !window.confirm('Alterar faixas reajustará as colunas de TODAS as peças, copiando para novas faixas o valor da faixa inferior mais próxima. Faça backup antes. Continuar?')) return;
    setBusy(true);
    try { await saveGlobalPricing({ ...settings, qs }, data.products, data.config.qs, user.uid); await load(); setSuccess('Configurações gerais atualizadas para todos os vendedores.'); }
    catch (err) { setError(`Não foi possível salvar as configurações: ${err.message}`); }
    finally { setBusy(false); }
  }

  const products = data?.products || [];
  const displayed = products.filter((p) => (showInactive || p.active) && [p.name, p.category, p.modelCode, p.fabric].join(' ').toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')));
  const activeCount = products.filter((p) => p.active && priceCodesForConfig(data?.config).every((code)=>p.prices?.[code]?.length===data?.config.qs.length && p.prices[code].every((n)=>Number.isInteger(n)&&n>0))).length;
  const codes = Object.keys(draft?.prices || {}).filter((code) => code.startsWith(group) && (`${code} ${prettyCode(code)}`).toLocaleLowerCase('pt-BR').includes(codeSearch.toLocaleLowerCase('pt-BR')));
  const isSaved = !!products.find((p) => p.id === draft?.id);
  const categories = [...new Set(products.map((p) => p.category).filter(Boolean))].sort();
  const editingLocked = data?.legacy;

  return <main className="pricing-admin-page">
    <header className="pricing-admin-top">
      <div className="pricing-admin-brand"><MartinpelBrand compact subtitle="Centro de precificação" /><span>Administração</span></div>
      <nav className="pricing-admin-nav">
        <Link to="/admin" className="button button-secondary">Painel geral</Link>
        <Link to="/simulador" className="button button-secondary">Abrir simulador</Link>
        <button type="button" className="button admin-logout-button" onClick={logout}>Sair</button>
      </nav>
    </header>
    <section className="pricing-admin-hero">
      <div><span className="catalog-kicker">Área exclusiva do administrador</span><h1>Gestão de preços e produtos</h1><p>Cadastre novos uniformes, detalhe materiais e modelos, controle todas as técnicas de aplicação e mantenha os preços por quantidade em um único lugar.</p></div>
      <div className="pricing-admin-hero-metrics"><div><strong>{products.length}</strong><small>Modelos cadastrados</small></div><div><strong>{activeCount}</strong><small>Ativos para venda</small></div><div><strong>{data?.config.qs.length || '–'}</strong><small>Faixas de volume</small></div></div>
    </section>
    {error && <div role="alert" className="notice notice-error pricing-admin-error">
      <strong>Não foi possível carregar o catálogo</strong>
      <p>{error}</p>
      {error.includes('negada pelo Firestore') && <div className="pricing-admin-diagnostic">
        <span>Projeto: <code>personalizakoleni</code></span>
        <span>Acesso à tela: administrador autenticado</span>
        <span>Confira a aba <strong>Regras</strong> do Cloud Firestore e o caminho informado acima.</span>
        <a href="https://console.firebase.google.com/project/personalizakoleni/firestore/rules" target="_blank" rel="noreferrer">Abrir regras publicadas do Firestore</a>
        <a href="https://github.com/99eliel/koleni/blob/main/firestore.rules" target="_blank" rel="noreferrer">Comparar com as regras do repositório</a>
      </div>}
    </div>}
    {success && <div role="status" className="notice notice-success">{success}</div>}
    {!loaded && <div className="panel pricing-admin-wait">Carregando catálogo de preços…</div>}
    {loaded && !data && <button className="button button-secondary" type="button" onClick={() => load()}>Tentar novamente</button>}
    {data && <>
      {data.legacy && <section className="pricing-admin-legacy panel"><div><strong>A tabela original está protegida</strong><p>Para gerenciar cada modelo individualmente, converta os produtos atuais para o novo cadastro. Os valores e combinações existentes não serão alterados.</p></div><button type="button" className="button button-primary" disabled={busy} onClick={migrate}>Ativar controle individual de peças</button></section>}
      <section className="pricing-admin-tools panel">
        <div className="pricing-admin-tabs"><button type="button" className={mode==='products'?'active':''} onClick={() => {setMode('products');clearNotice();}}>Produtos e preços</button><button type="button" className={mode==='settings'?'active':''} onClick={() => {if(allowDiscard())setMode('settings');}}>Regras gerais</button></div>
        <div className="pricing-admin-utilities"><button type="button" className="button button-secondary" onClick={downloadBackup}>Baixar backup JSON</button><label className="button button-secondary pricing-import">Atualizar preços (HTML/JSON)<input ref={fileInputRef} type="file" accept=".html,.htm,.json,text/html,application/json" onChange={importJson} disabled={busy} /></label><button type="button" className="button button-secondary" onClick={() => {if(allowDiscard())load();}} disabled={busy}>Atualizar dados</button></div>
      </section>
      {mode === 'settings' && <section className="panel pricing-admin-settings">
        <div><h2>Regras gerais do simulador</h2><p>Esses parâmetros afetam todas as peças. Os preços dos modelos continuam individuais.</p></div>
        <div className="pricing-admin-settings-grid">
          <label>Faixas de quantidade (separadas por vírgulas)<input value={tiersText} onChange={(e) => setTiersText(e.target.value)} disabled={busy || editingLocked} placeholder="10, 20, 50, 100, 250, 500" /><small>Alterar faixas reorganiza as colunas da matriz. Faça um backup antes.</small></label>
          <label>Desconto à vista (%)<input type="number" min="0" max="95" step="0.5" value={Math.round(settings.avista * 10000) / 100} onChange={(e) => setSettings((prev) => ({...prev, avista:Number(e.target.value)/100}))} disabled={busy || editingLocked}/></label>
          <label>Desconto da terceira tabela (%)<input type="number" min="0" max="95" step="0.5" value={Math.round(settings.t3 * 10000) / 100} onChange={(e) => setSettings((prev) => ({...prev, t3:Number(e.target.value)/100}))} disabled={busy || editingLocked}/></label>
          <label>Número de parcelas<input type="number" min="1" max="36" value={settings.parc} onChange={(e) => setSettings((prev) => ({...prev, parc:Number(e.target.value)}))} disabled={busy || editingLocked}/></label>
          <label>Prazo padrão de entrega (dias)<input type="number" min="1" max="730" value={settings.deliveryDays} onChange={(e) => setSettings((prev) => ({...prev, deliveryDays:Number(e.target.value)}))} disabled={busy || editingLocked}/></label>
          <label>Validade do orçamento (dias)<input type="number" min="1" max="365" value={settings.validDays} onChange={(e) => setSettings((prev) => ({...prev, validDays:Number(e.target.value)}))} disabled={busy || editingLocked}/></label>
          <label>Tamanho padrão da arte<input value={settings.artSizeCm} maxLength={80} onChange={(e) => setSettings((prev) => ({...prev, artSizeCm:e.target.value}))} disabled={busy || editingLocked}/></label>
          {settings.pricingEngine === 'shared-setup-v3' && <>
            <label>Bandeira: limite (peças)<input type="number" min="1" step="1" value={settings.band.lim} onChange={(e)=>setSettings((prev)=>({...prev,band:{...prev.band,lim:Number(e.target.value)}}))} disabled={busy||editingLocked}/></label>
            <label>Bandeira até o limite (R$/peça)<input type="number" min="0" step="0.01" value={settings.band.a} onChange={(e)=>setSettings((prev)=>({...prev,band:{...prev.band,a:Number(e.target.value)}}))} disabled={busy||editingLocked}/></label>
            <label>Bandeira acima do limite (R$/peça)<input type="number" min="0" step="0.01" value={settings.band.b} onChange={(e)=>setSettings((prev)=>({...prev,band:{...prev.band,b:Number(e.target.value)}}))} disabled={busy||editingLocked}/></label>
          </>}
          <label>Identificação da versão da tabela<input value={settings.gerado} maxLength={60} placeholder="Ex.: Novembro de 2026" onChange={(e) => setSettings((prev) => ({...prev, gerado:e.target.value}))} disabled={busy || editingLocked}/></label>
        </div>
        {settings.pricingEngine === 'shared-setup-v3' && <details className="pricing-admin-setup-costs">
          <summary><strong>Custos de tela/matriz por tipo de arte</strong> — abrir controle de valores</summary>
          <p>Valores de preparação em reais, cobrados uma vez por arte e distribuídos entre os itens que a reutilizam.</p>
          <div className="pricing-admin-settings-grid">
            {Object.entries(settings.tc || {}).sort(([a],[b])=>a.localeCompare(b)).map(([code, value])=>
              <label key={code}>{prettyCode(code)} · {code}
                <input type="number" min="0" step="0.01" value={value}
                  disabled={busy || editingLocked}
                  onChange={(e)=>setSettings((prev)=>({...prev,tc:{...prev.tc,[code]:Number(e.target.value)}}))}/>
              </label>
            )}
          </div>
        </details>}
        <button type="button" className="button button-primary" onClick={saveSettings} disabled={busy || editingLocked}>{busy?'Salvando…':'Salvar regras gerais'}</button>
      </section>}
      {mode === 'products' && <div className="pricing-admin-layout">
        <aside className="panel pricing-admin-list">
          <div className="pricing-admin-list-heading"><div><h2>Modelos</h2><small>Selecione para editar</small></div><button type="button" className="button button-primary" disabled={busy || editingLocked || !products.length} onClick={() => createFrom()}>+ Nova peça</button></div>
          <label className="pricing-admin-search">Pesquisar<input type="search" placeholder="Nome, tecido ou categoria" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
          <label className="pricing-admin-check"><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Mostrar peças inativas</label>
          <div className="pricing-admin-list-items">{displayed.map((p) => <button type="button" key={p.id} className={`pricing-admin-product ${p.id===selectedId?'selected':''}`} onClick={() => chooseProduct(p)}><div className="pricing-admin-product-photo">{p.imageUrl ? <img src={p.imageUrl} alt=""/> : <span>◈</span>}</div><div><strong>{p.name}</strong><small>{p.category || p.fabric || 'Sem categoria'}</small><span className={p.active?'pricing-active':'pricing-inactive'}>{p.active?'Ativa':'Inativa'}</span></div></button>)}
            {!displayed.length && <div className="pricing-admin-empty">Nenhum modelo encontrado.</div>}
          </div>
        </aside>
        <section className="panel pricing-admin-editor">
          {!draft && <div className="pricing-admin-placeholder"><h2>Cadastre os preços da confecção</h2><p>Importe a tabela Koleni para começar. Depois você poderá criar modelos e preencher todos os detalhes.</p><label className="button button-primary pricing-import">Importar HTML ou JSON<input type="file" accept=".html,.htm,.json,text/html,application/json" onChange={importJson}/></label></div>}
          {draft && <>
            <div className="pricing-admin-editor-head"><div><span className="catalog-kicker">{isSaved?'Editar cadastro':'Nova peça ainda não salva'}</span><h2>{draft.name || 'Novo modelo'}</h2><p>{dirty || photo ? 'Alterações pendentes de salvamento' : 'Dados sincronizados com o Firebase'}</p></div><div className="pricing-admin-editor-actions"><button type="button" className="button button-secondary" onClick={duplicateSelected} disabled={busy || editingLocked}>Duplicar modelo</button><button type="button" className="button button-primary" onClick={saveCurrent} disabled={busy || editingLocked}>{busy?'Salvando…':'Salvar alterações'}</button></div></div>
            <fieldset disabled={busy || editingLocked} className="pricing-admin-fieldset"><legend>Identificação e informações da peça</legend>
              <div className="pricing-admin-form-grid">
                <label className="wide">Nome comercial *<input value={draft.name} maxLength={180} onChange={(e) => update('name', e.target.value)} placeholder="Ex.: Camiseta dry fit manga longa"/></label>
                <label>Categoria<input list="pricing-categories" value={draft.category} maxLength={100} onChange={(e) => update('category',e.target.value)} placeholder="Ex.: Camisetas"/><datalist id="pricing-categories">{categories.map((cat) => <option key={cat} value={cat}/>)}</datalist></label>
                <label>Código / referência<input value={draft.modelCode} maxLength={90} onChange={(e) => update('modelCode',e.target.value)} placeholder="Ex.: KL-CAM-001"/></label>
                <label>Tecido<input value={draft.fabric} maxLength={180} onChange={(e) => update('fabric',e.target.value)} placeholder="Ex.: Malha PV"/></label>
                <label>Composição<input value={draft.composition} maxLength={180} onChange={(e) => update('composition',e.target.value)} placeholder="Ex.: 65% poliéster, 35% viscose"/></label>
                <label>Tamanhos disponíveis<input value={draft.sizes} maxLength={180} onChange={(e) => update('sizes',e.target.value)} placeholder="Ex.: PP, P, M, G, GG"/></label>
                <label>Posição na listagem<input type="number" value={draft.sortOrder} onChange={(e) => update('sortOrder',Number(e.target.value))}/></label>
                <label className="wide">Descrição para os vendedores<textarea rows={3} value={draft.description} maxLength={1200} onChange={(e) => update('description',e.target.value)} placeholder="Modelagem, acabamento, informações para oferecer ao cliente…"/></label>
                <label className="wide">Observações técnicas e comerciais<textarea rows={3} value={draft.notes} maxLength={1400} onChange={(e) => update('notes',e.target.value)} placeholder="Regras específicas, cuidados, restrições, observações…"/></label>
                <label className="wide">Foto de referência (arquivo, até 5 MB)<input type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files?.[0]||null)} /><small>{photo?`Nova foto: ${photo.name}`:'A imagem será salva no Firebase Storage ao salvar o modelo.'}</small></label>
                <label className="wide">Ou endereço da foto<input type="url" value={draft.imageUrl} onChange={(e) => update('imageUrl', e.target.value)} placeholder="https://..."/></label>
                {draft.imageUrl && <div className="pricing-admin-photo-preview"><img src={draft.imageUrl} alt={`Prévia de ${draft.name}`}/><button type="button" className="button button-secondary" onClick={() => {update('imageUrl','');setPhoto(null);}}>Remover foto</button></div>}
              </div>
              <div className="pricing-admin-extra-head"><h3>Informações adicionais</h3><button className="button button-secondary" type="button" onClick={() => update('extraFields',[...draft.extraFields,{label:'',value:''}])} disabled={draft.extraFields.length>=30}>+ Adicionar campo</button></div>
              {draft.extraFields.map((field,index) => <div key={index} className="pricing-admin-extra-row"><input aria-label="Nome do campo" placeholder="Ex.: Gramatura" value={field.label} maxLength={90} onChange={(e)=>update('extraFields',draft.extraFields.map((f,i)=>i===index?{...f,label:e.target.value}:f))}/><input aria-label="Valor do campo" placeholder="Ex.: 180 g/m²" value={field.value} maxLength={400} onChange={(e)=>update('extraFields',draft.extraFields.map((f,i)=>i===index?{...f,value:e.target.value}:f))}/><button type="button" className="button button-secondary" onClick={()=>update('extraFields',draft.extraFields.filter((_,i)=>i!==index))}>Remover</button></div>)}
              <label className="pricing-admin-activation"><input type="checkbox" checked={draft.active} onChange={(e) => update('active',e.target.checked)}/><span><strong>Disponibilizar esta peça no simulador do vendedor</strong><small>Se inativa, a peça permanece cadastrada e editável, mas não aparece nos orçamentos novos.</small></span></label>
            </fieldset>
            {data.config.pricingEngine === 'shared-setup-v3' && <fieldset disabled={busy || editingLocked} className="pricing-admin-fieldset">
              <legend>Fatores técnicos do custo de produção</legend>
              <p>Use os números da planilha. Eles alteram a formação dos preços abaixo da primeira faixa e o rateio de tela ou matriz.</p>
              <div className="pricing-admin-form-grid">
                <label>Fator abaixo da primeira faixa
                  <input type="number" min="0.01" step="0.0001" value={draft.belowMinFactor}
                    onChange={(e)=>update('belowMinFactor',Number(e.target.value))}/>
                </label>
                {(data.config.qs||[]).map((tier,index)=><label key={tier}>Fator de rateio · {tier.toLocaleString('pt-BR')} peças
                  <input type="number" min="0.01" step="0.0001" value={draft.setupDivisors[index]||''}
                    onChange={(e)=>update('setupDivisors', data.config.qs.map((_,i)=>i===index?Number(e.target.value):(draft.setupDivisors[i]||1)))}/>
                </label>)}
              </div>
            </fieldset>}
            <section className="pricing-admin-price-section"><div className="pricing-admin-price-head"><div><h3>Matriz de preços por técnica</h3><p>Valores em R$ por peça. Cada linha preserva uma combinação da planilha original. Escolha a técnica para facilitar a edição.</p></div><span>{Object.keys(draft.prices).length} combinações</span></div>
              <div className="pricing-admin-group-bar">{groups.map(([value,label])=><button type="button" key={value} className={group===value?'active':''} onClick={()=>{setGroup(value);setCodeSearch('');}}>{label}<small>{Object.keys(draft.prices).filter((code)=>code.startsWith(value)).length}</small></button>)}</div>
              <label className="pricing-admin-code-search">Filtrar combinação<input type="search" value={codeSearch} onChange={(e)=>setCodeSearch(e.target.value)} placeholder="Ex.: 2 posições, arte complexa, código S1P100…"/></label>
              <div className="pricing-admin-matrix-scroller"><table><thead><tr><th>Aplicação / código</th>{data.config.qs.map((tier)=><th key={tier}>{tier.toLocaleString('pt-BR')} peças</th>)}</tr></thead><tbody>{codes.map((code)=><tr key={code}><th><strong>{prettyCode(code)}</strong><small>{code}</small></th>{(draft.prices[code]||[]).map((cents,idx)=><td key={`${code}-${idx}`}><input aria-label={`${prettyCode(code)}, ${data.config.qs[idx]} peças`} type="number" min="0" step="0.01" inputMode="decimal" disabled={busy || editingLocked} value={cents>0?String(cents/100):''} onChange={(e)=>patchPrice(code,idx,e.target.value)} placeholder="0,00"/></td>)}</tr>)}
                {!codes.length && <tr><td colSpan={data.config.qs.length+1}>Nenhuma combinação encontrada.</td></tr>}</tbody></table></div>
              <small className="pricing-admin-price-note">
                Os preços são armazenados em centavos. {data.config.pricingEngine === 'shared-setup-v3'
                  ? 'A tabela de novembro calcula posições adicionais a partir da primeira, além de ratear tela/matriz por arte.'
                  : 'A simulação mantém o motor da tabela antiga.'}
              </small>
            </section>
            <footer className="pricing-admin-editor-footer"><div>{dirty||photo?'● Existem alterações não salvas':'Cadastro salvo'} · {draft.active?'Ativo':'Inativo'}</div><div>{isSaved && <button type="button" className="button button-secondary pricing-admin-danger" onClick={deleteCurrent} disabled={busy || editingLocked}>Excluir peça</button>}<button type="button" className="button button-primary" onClick={saveCurrent} disabled={busy || editingLocked}>{busy?'Salvando…':'Salvar peça e preços'}</button></div></footer>
          </>}
        </section>
      </div>}
      <div className="pricing-admin-bottom-note">Acesso exclusivo de administradores. Os valores ficam no Firestore, fora do código público. Todas as peças já vendidas mantêm seus orçamentos gravados.</div>
    </>}
  </main>;
}

export default function PricingAdminPage() {
  return <AdminAuth>{({user,logout})=><PricingAdminContent user={user} logout={logout}/>}</AdminAuth>;
}