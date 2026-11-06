import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import MartinpelBrand from '../components/MartinpelBrand';
import { readPieceCart } from '../lib/multiPieceCart';
import { readSimulatorQuoteDraft, saveSimulatorQuoteDraft } from '../lib/simulatorQuoteDraft';
import '../quote-simulator.css';

const money = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);
const round = (value) => Math.round(Number(value) * 100) / 100;

function automaticMatching(cart, simulated) {
  const assigned = new Set();
  const result = {};
  cart.forEach((piece, index) => {
    const exact = simulated.findIndex((item, simulatedIndex) =>
      !assigned.has(simulatedIndex) && Number(item.quantity) === Number(piece.quantity) &&
      item.name.toLowerCase().trim() === String(piece.garmentName || '').toLowerCase().trim());
    const sameQuantity = exact >= 0 ? exact : simulated.findIndex((item, simulatedIndex) =>
      !assigned.has(simulatedIndex) && Number(item.quantity) === Number(piece.quantity));
    const selected = sameQuantity >= 0 ? sameQuantity : simulated.findIndex((_, simulatedIndex) => !assigned.has(simulatedIndex));
    if (selected >= 0) {
      assigned.add(selected);
      result[index] = String(selected);
    }
  });
  return result;
}

export default function QuoteSimulatorPage({ user, profile, isAdmin = false, logout }) {
  const navigate = useNavigate();
  const frameRef = useRef(null);
  const [cart] = useState(() => readPieceCart(user?.uid));
  const [received, setReceived] = useState(null);
  const [frameHeight, setFrameHeight] = useState(1550);
  const [frameReady, setFrameReady] = useState(false);
  const [mapping, setMapping] = useState({});
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const savedQuote = readSimulatorQuoteDraft(user?.uid, cart);

  // O arquivo HTML da equipe é carregado sem qualquer alteração.
  // A integração com o carrinho ocorre apenas nesta página externa ao HTML.
  function handleFrameLoad() {
    const doc = frameRef.current?.contentDocument;
    if (!doc?.body) return;
    const height = Math.ceil(Math.max(doc.body.scrollHeight, doc.documentElement.scrollHeight)) + 12;
    if (Number.isFinite(height) && height >= 550 && height <= 18000) setFrameHeight(height);
    setFrameReady(true);
  }

  useEffect(() => {
    if (!frameReady || typeof ResizeObserver === 'undefined') return undefined;
    const doc = frameRef.current?.contentDocument;
    if (!doc?.body) return undefined;
    const observer = new ResizeObserver(() => {
      const height = Math.ceil(Math.max(doc.body.scrollHeight, doc.documentElement.scrollHeight)) + 12;
      if (Number.isFinite(height) && height >= 550 && height <= 18000) setFrameHeight(height);
    });
    observer.observe(doc.body);
    return () => observer.disconnect();
  }, [frameReady]);

  function receiveOriginalQuote() {
    setError('');
    try {
      const simulator = frameRef.current?.contentWindow;
      const originalItems = simulator?.IT;
      if (!Array.isArray(originalItems)) throw new Error('O HTML original ainda não terminou de carregar.');
      if (!originalItems.length) throw new Error('Adicione os produtos ao orçamento no simulador acima antes de transferir os preços.');
      if (originalItems.length > 20) throw new Error('O pedido aceita até 20 produtos por vez.');
      const items = originalItems.map((item) => ({
        name: String(item.n || '').trim(),
        quantity: Number(item.q),
        unitPrice: Number(item.p),
        application: String(item.ap || 'Sem aplicação'),
      }));
      if (items.some((item) => !item.name || !Number.isInteger(item.quantity) || item.quantity <= 0 ||
        !Number.isFinite(item.unitPrice) || item.unitPrice <= 0)) {
        throw new Error('Há itens sem nome, quantidade ou preço válido no simulador original.');
      }
      const originalSettings = simulator.D || {};
      const total = round(items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0));
      setReceived({
        items,
        total,
        installments: Number(originalSettings.parc) || 3,
        cashDiscount: Number(originalSettings.avista) || 0,
        deliveryDays: Number(simulator.PRAZO) || 30,
        generatedAt: String(originalSettings.gerado || ''),
      });
      setMapping(automaticMatching(cart, items));
      setMessage('Preços lidos diretamente do HTML recebido, sem alterar seus cálculos. Confira a correspondência com cada peça do pedido.');
      requestAnimationFrame(() => document.querySelector('#simulador-conferencia')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    } catch (err) {
      setError(err.message || 'Não foi possível ler os itens do simulador original.');
    }
  }

  function applyToCart() {
    setError('');
    if (!received || !cart.length) return setError('Personalize e adicione peças ao carrinho primeiro.');
    if (received.items.length !== cart.length) return setError('A quantidade de itens simulados deve ser igual à quantidade de personalizações do carrinho. Adicione um preço para cada item.');
    const selected = cart.map((_, index) => Number(mapping[index]));
    if (selected.some((index) => !Number.isInteger(index) || index < 0 || index >= received.items.length)) return setError('Associe um produto da tabela a cada peça.');
    if (new Set(selected).size !== cart.length) return setError('Cada item da simulação deve ser utilizado uma única vez.');
    if (cart.some((piece, index) => Number(piece.quantity) !== Number(received.items[selected[index]].quantity))) {
      return setError('A quantidade de alguma peça é diferente da quantidade simulada. Corrija no simulador antes de aplicar.');
    }
    const lines = cart.map((piece, index) => {
      const simulated = received.items[selected[index]];
      return {
        id: piece.id,
        garmentId: piece.garmentId,
        garmentName: piece.garmentName,
        quantity: Number(piece.quantity),
        unitPrice: round(simulated.unitPrice),
        total: round(Number(piece.quantity) * round(simulated.unitPrice)),
        description: `${simulated.application} · Base de preço: ${simulated.name}`.slice(0, 800),
      };
    });
    const total = round(lines.reduce((sum, item) => sum + item.total, 0));
    const terms = `Preço sugerido pelo simulador Koleni. Parcelamento: até ${received.installments || 3}x. À vista: ${Math.round(Number(received.cashDiscount || 0) * 100)}% de desconto. Valores sujeitos à conferência.`;
    const quote = {
      items: lines,
      unitPrice: lines.length === 1 ? lines[0].unitPrice : 0,
      total,
      estimatedTime: `${received.deliveryDays || 30} dias (estimativa)`,
      notes: terms,
      simulatorSource: received.generatedAt ? `html-original-koleni-${received.generatedAt}` : 'html-original-koleni',
      pricingEngine: 'original-html',
    };
    try {
      saveSimulatorQuoteDraft(user.uid, cart, quote);
      navigate('/vendedor');
    } catch (err) {
      setError(err.message || 'Não foi possível aplicar os preços ao pedido.');
    }
  }

  const mappingIsCorrect = !!received && received.items.length === cart.length && cart.every((piece, index) => {
    const chosen = Number(mapping[index]);
    return mapping[index] !== undefined && Number.isInteger(chosen) &&
      received.items[chosen] && Number(received.items[chosen].quantity) === Number(piece.quantity);
  }) && (new Set(cart.map((_, index) => mapping[index])).size === cart.length);

  return <main className="simulator-shell">
    <header className="simulator-topbar">
      <MartinpelBrand compact subtitle="Simulação de orçamento" />
      <div className="simulator-top-actions">
        <Link className="button button-secondary" to="/vendedor">Voltar ao catálogo / pedido</Link>
        {isAdmin && <Link className="button button-primary" to="/admin/simulador">Gerenciar preços e modelos</Link>}
        <button className="button admin-logout-button" type="button" onClick={logout}>Sair</button>
      </div>
    </header>
    <section className="simulator-intro panel">
      <div><span className="catalog-kicker">Precificação por quantidade</span>
        <h1>Simulador de orçamento Koleni</h1>
        <p>Escolha o modelo, informe a quantidade e selecione silk, DTF, bordado ou peça lisa. Confira a precificação em tempo real e monte seu orçamento com diferentes produtos.</p>
      </div>
      <div className="simulator-count"><strong>{cart.length}</strong><span>personalizações no carrinho</span></div>
    </section>
    <section className="simulator-private panel">
      <div>
        <strong>Calculadora original da Koleni</strong>
        <p>Os produtos, preços, descontos e cálculos são exatamente os do HTML enviado pela equipe. As alterações feitas no cadastro de preços do Firebase não substituem os valores deste arquivo.</p>
      </div>
      {isAdmin && <Link className="button button-secondary" to="/admin/simulador">Área administrativa de preços</Link>}
    </section>
    {cart.length > 0 && <section className="simulator-cart panel">
      <h2>Peças que você já personalizou</h2>
      <p>Inclua no simulador um produto correspondente para cada peça abaixo, com a mesma quantidade. Depois de adicionar os produtos no HTML, use <strong>Conferir preços do HTML no pedido</strong>, abaixo do simulador.</p>
      <div className="simulator-pieces">
        {cart.map((item, index) => <div className="simulator-piece" key={item.id || index}>
          {item.finalImageUrl && <img src={item.finalImageUrl} alt="Arte personalizada" />}
          <div><strong>{index + 1}. {item.garmentName}</strong><small>{item.quantity} peças</small></div>
        </div>)}
      </div>
      {savedQuote && <p className="simulator-saved">Já existe uma simulação aplicada a este carrinho: <strong>{money(savedQuote.total)}</strong>. É possível substituí-la.</p>}
    </section>}
    {!cart.length && <div className="simulator-info">O carrinho está vazio. Você pode usar o simulador para orçamentos avulsos, exportar os arquivos ou voltar ao catálogo para personalizar peças antes de transferir os preços.</div>}
    <section className="simulator-frame-panel" aria-label="Tabela de simulação de preços">
      <iframe
        ref={frameRef}
        src={`${import.meta.env.BASE_URL}simulador-orcamento.html`}
        title="Calculadora original de preços Koleni"
        allow="clipboard-write"
        loading="eager"
        onLoad={handleFrameLoad}
        style={{ height: `${frameHeight}px` }}
      />
    </section>
    {cart.length > 0 && <section className="simulator-private panel">
      <div>
        <strong>Aplicar o orçamento original ao pedido</strong>
        <p>Quando terminar o orçamento no HTML acima, confira os valores antes de vinculá-los às peças personalizadas.</p>
        {error && <div className="notice notice-error">{error}</div>}
      </div>
      <button className="button button-primary" type="button" onClick={receiveOriginalQuote}>Conferir preços do HTML no pedido</button>
    </section>}
    {received && <section id="simulador-conferencia" className="simulator-review panel">
      <h2>Conferência dos preços calculados</h2>
      <p>{message}</p>
      <div className="simulator-review-total">Total da simulação <strong>{money(received.total)}</strong></div>
      {cart.length ? <>
        <p>Relacione cada peça personalizada ao produto usado no cálculo. É obrigatório que as quantidades sejam iguais.</p>
        {cart.map((piece, index) => {
          const chosen = received.items[Number(mapping[index])];
          const valid = chosen && Number(chosen.quantity) === Number(piece.quantity);
          return <div className="simulator-match" key={piece.id || index}>
            <div><strong>{index + 1}. {piece.garmentName}</strong><span>{piece.quantity} peças na personalização</span></div>
            <label>Produto utilizado no simulador
              <select value={mapping[index] ?? ''} onChange={(event) => setMapping((current) => ({ ...current, [index]: event.target.value }))}>
                <option value="">Selecione</option>
                {received.items.map((result, resultIndex) => <option value={resultIndex} key={resultIndex}>{resultIndex + 1}. {result.name} · {result.quantity} peças · {money(result.unitPrice)}/peça</option>)}
              </select>
            </label>
            <div className={valid ? 'simulator-match-valid' : 'simulator-match-invalid'}>{valid ? `Subtotal: ${money(chosen.unitPrice * piece.quantity)}` : 'Quantidade diferente ou item não selecionado'}</div>
          </div>;
        })}
        {error && <div className="notice notice-error">{error}</div>}
        <button className="button button-primary simulator-apply" type="button" disabled={!mappingIsCorrect} onClick={applyToCart}>Aplicar preços ao pedido e voltar ao carrinho</button>
        <small>O orçamento será registrado junto com o pedido quando você finalizar o atendimento. Nenhum pedido é criado nesta etapa.</small>
      </> : <p>Orçamento avulso concluído. Use as opções de exportação do simulador acima.</p>}
    </section>}
  </main>;
}