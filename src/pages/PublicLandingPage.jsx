import MartinpelBrand from '../components/MartinpelBrand';
import '../public-landing.css';

const FEATURES = [
  {
    icon: '◫',
    title: 'Personalização visual de uniformes',
    text: 'Monte a peça com cores, logos, nomes e números diretamente no preview antes de registrar o pedido.',
  },
  {
    icon: '▦',
    title: 'Gestão de logos',
    text: 'Organize os arquivos usados em cada peça, identifique onde cada logo está aplicada e mantenha o layout sob controle.',
  },
  {
    icon: '✦',
    title: 'Remoção de fundo com inteligência artificial',
    text: 'Prepare logos para aplicação nos mockups com recursos de remoção de fundo e refinamento integrados ao fluxo de personalização.',
  },
  {
    icon: '✓',
    title: 'Aprovação e acompanhamento',
    text: 'Centralize a conferência do layout, o registro do pedido e o acompanhamento das etapas de produção.',
  },
];

const STEPS = [
  ['01', 'Escolha a peça', 'A equipe acessa o catálogo de uniformes disponíveis para personalização.'],
  ['02', 'Monte o layout', 'Cores, logos e textos são posicionados visualmente sobre a peça.'],
  ['03', 'Revise a personalização', 'O sistema reúne os elementos do layout e facilita a conferência antes do pedido.'],
  ['04', 'Registre e acompanhe', 'O pedido segue para o fluxo interno de atendimento e produção.'],
];

export default function PublicLandingPage() {
  return (
    <main className="martinpel-public">
      <header className="public-nav">
        <div className="public-nav-inner">
          <MartinpelBrand compact subtitle="Gestão da Personalização" />
          <a className="public-login-button" href="#/vendedor">Acessar sistema</a>
        </div>
      </header>

      <section className="public-hero">
        <div className="public-hero-copy">
          <span className="public-kicker">Koleni · Gestão da Personalização</span>
          <h1>Sistema de gestão da personalização de uniformes Koleni</h1>
          <p>
            Uma plataforma criada para organizar o processo de personalização de uniformes:
            escolha de cores, aplicação de logos, nomes e números, tratamento de imagens,
            aprovação de layouts e acompanhamento de pedidos.
          </p>
          <div className="public-hero-actions">
            <a className="public-primary-button" href="#/vendedor">Entrar na plataforma</a>
            <a className="public-secondary-button" href="#recursos">Conhecer os recursos</a>
          </div>
          <div className="public-search-tags" aria-label="Áreas do sistema">
            <span>Personalização de uniformes</span>
            <span>Gestão de logos</span>
            <span>Layouts de produção</span>
            <span>Inteligência artificial</span>
          </div>
        </div>

        <div className="public-hero-visual" aria-label="Visão geral da plataforma Koleni">
          <div className="public-dashboard-card">
            <div className="public-dashboard-top">
              <img src={`${import.meta.env.BASE_URL}pwa-icon.svg`} alt="" aria-hidden="true" />
              <div>
                <small>Plataforma interna</small>
                <strong>Koleni Personalização</strong>
              </div>
              <span className="public-status">Operacional</span>
            </div>
            <div className="public-dashboard-grid">
              <div><span>01</span><strong>Catálogo</strong><small>Peças e modelos</small></div>
              <div><span>02</span><strong>Personalizar</strong><small>Cores e logos</small></div>
              <div><span>03</span><strong>Aprovar</strong><small>Layout do cliente</small></div>
              <div><span>04</span><strong>Produzir</strong><small>Fluxo interno</small></div>
            </div>
            <div className="public-dashboard-footer">
              <div className="public-progress"><span /></div>
              <small>Fluxo de personalização centralizado em uma única plataforma.</small>
            </div>
          </div>
        </div>
      </section>

      <section className="public-intro" aria-labelledby="sobre-sistema">
        <div>
          <span className="public-section-label">Sobre o sistema</span>
          <h2 id="sobre-sistema">Gestão da personalização da Koleni em um único fluxo</h2>
        </div>
        <p>
          O sistema foi desenvolvido para tornar mais simples o trabalho entre atendimento,
          criação do layout e produção. Em vez de depender de arquivos e informações espalhados,
          a equipe consegue visualizar a peça, aplicar os elementos da personalização e registrar
          o resultado de forma organizada.
        </p>
      </section>

      <section className="public-section" id="recursos" aria-labelledby="recursos-titulo">
        <div className="public-section-heading">
          <span className="public-section-label">Recursos</span>
          <h2 id="recursos-titulo">Ferramentas para personalização de uniformes</h2>
          <p>Recursos pensados para o dia a dia da operação e para reduzir retrabalho na montagem dos pedidos.</p>
        </div>
        <div className="public-feature-grid">
          {FEATURES.map((feature) => (
            <article className="public-feature-card" key={feature.title}>
              <span className="public-feature-icon" aria-hidden="true">{feature.icon}</span>
              <h3>{feature.title}</h3>
              <p>{feature.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="public-flow-section" aria-labelledby="fluxo-titulo">
        <div className="public-section-heading">
          <span className="public-section-label">Fluxo de trabalho</span>
          <h2 id="fluxo-titulo">Da escolha da peça ao acompanhamento do pedido</h2>
        </div>
        <div className="public-flow-grid">
          {STEPS.map(([number, title, text]) => (
            <article key={number}>
              <span>{number}</span>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="public-seo-copy" aria-labelledby="personalizacao-titulo">
        <div className="public-seo-copy-main">
          <span className="public-section-label">Koleni Personalização</span>
          <h2 id="personalizacao-titulo">Tecnologia aplicada à gestão de uniformes personalizados</h2>
          <p>
            A plataforma Koleni Gestão da Personalização reúne ferramentas para simulação de
            cores, aplicação e gerenciamento de logos, personalização com nomes e números,
            remoção de fundo de imagens com inteligência artificial, conferência de layouts e
            organização dos pedidos personalizados.
          </p>
          <p>
            O objetivo é dar à equipe uma visão clara do que foi solicitado e de como cada
            personalização deve ficar antes de seguir para produção.
          </p>
        </div>
        <aside>
          <strong>Principais áreas</strong>
          <ul>
            <li>Gestão de personalização de uniformes</li>
            <li>Aplicação e organização de logos</li>
            <li>Mockup visual das peças</li>
            <li>Tratamento de imagens e IA</li>
            <li>Pedidos e fluxo de produção</li>
          </ul>
        </aside>
      </section>

      <section className="public-cta">
        <img src={`${import.meta.env.BASE_URL}pwa-icon.svg`} alt="" aria-hidden="true" />
        <div>
          <span>Área interna Koleni</span>
          <h2>Acesse a plataforma de personalização</h2>
          <p>O acesso às ferramentas operacionais é reservado à equipe autorizada.</p>
        </div>
        <a className="public-primary-button" href="#/vendedor">Acessar sistema</a>
      </section>

      <footer className="public-footer">
        <MartinpelBrand compact subtitle="Gestão da Personalização" />
        <div className="public-footer-links">
          <p>Sistema de gestão da personalização de uniformes Koleni.</p>
          <a href="#/vendedor">Acessar a área interna da Koleni</a>
        </div>
      </footer>
    </main>
  );
}
