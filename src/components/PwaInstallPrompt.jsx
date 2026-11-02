import { useEffect, useMemo, useState } from 'react';

function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

export default function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installed, setInstalled] = useState(() => isStandalone());
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem('koleni-pwa-dismissed') === '1');
  const isIos = useMemo(() => /iphone|ipad|ipod/i.test(window.navigator.userAgent), []);

  useEffect(() => {
    function handleBeforeInstallPrompt(event) {
      event.preventDefault();
      setDeferredPrompt(event);
    }

    function handleInstalled() {
      setInstalled(true);
      setDeferredPrompt(null);
      setShowIosHelp(false);
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  async function install() {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice?.outcome === 'accepted') setInstalled(true);
      setDeferredPrompt(null);
      return;
    }

    if (isIos) setShowIosHelp((value) => !value);
  }

  function dismiss() {
    sessionStorage.setItem('koleni-pwa-dismissed', '1');
    setDismissed(true);
  }

  if (installed || dismissed || (!deferredPrompt && !isIos)) return null;

  return (
    <aside className="pwa-install-card" aria-live="polite">
      <button className="pwa-install-close" type="button" onClick={dismiss} aria-label="Fechar aviso de instalação">×</button>
      <div className="pwa-install-icon">K</div>
      <div className="pwa-install-copy">
        <strong>Instalar Koleni Vendas</strong>
        <span>Abra catálogo e personalização como um app no celular.</span>
        {showIosHelp && <small>No iPhone: toque em Compartilhar e depois em “Adicionar à Tela de Início”.</small>}
      </div>
      <button className="button button-primary pwa-install-button" type="button" onClick={install}>
        {isIos && !deferredPrompt ? (showIosHelp ? 'Entendi' : 'Como instalar') : 'Instalar app'}
      </button>
    </aside>
  );
}
