import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminAuth from '../components/AdminAuth';
import MartinpelBrand from '../components/MartinpelBrand';
import { deleteGarmentPermanently, listGarments, setGarmentArchived } from '../lib/garmentRepo';
import { deleteGarmentStorageFiles } from '../lib/storageImages';
import '../catalog-trash.css';

function TrashWorkspace({ logout }) {
  const [garments, setGarments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function loadArchived() {
    setLoading(true);
    setError('');
    try {
      const items = await listGarments({ force: true, includeArchived: true });
      setGarments(items.filter((item) => item.archived));
    } catch (err) {
      setError(`Não foi possível carregar a lixeira: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadArchived();
  }, []);

  async function restoreGarment(garment) {
    setActionId(garment.id);
    setError('');
    setMessage('');
    try {
      await setGarmentArchived(garment.id, false);
      await loadArchived();
      setMessage(`Peça “${garment.name}” restaurada no catálogo.`);
    } catch (err) {
      setError(`Não foi possível restaurar a peça: ${err.message}`);
    } finally {
      setActionId('');
    }
  }

  async function deleteForever(garment) {
    const typed = window.prompt(
      `EXCLUSÃO PERMANENTE\n\nA peça “${garment.name}” e todas as imagens-base dela serão apagadas do Firebase. Pedidos antigos, logos compartilhadas e artes finais continuarão preservados.\n\nDigite EXCLUIR para confirmar:`,
    );

    if (typed === null) return;
    if (typed.trim().toUpperCase() !== 'EXCLUIR') {
      setError('Exclusão cancelada: digite exatamente EXCLUIR para confirmar.');
      setMessage('');
      return;
    }

    setActionId(garment.id);
    setError('');
    setMessage('');

    try {
      await deleteGarmentStorageFiles(garment.id);
      await deleteGarmentPermanently(garment.id);
      await loadArchived();
      setMessage(`Peça “${garment.name}” excluída permanentemente. As imagens-base também foram removidas do Storage.`);
    } catch (err) {
      setError(`Não foi possível concluir a exclusão permanente: ${err.message}`);
    } finally {
      setActionId('');
    }
  }

  return (
    <main className="trash-shell">
      <header className="trash-topbar">
        <MartinpelBrand compact subtitle="Lixeira do catálogo" />
        <div className="trash-topbar-actions">
          <Link className="button button-light" to="/admin">← Voltar ao painel</Link>
          <button className="button admin-logout-button" type="button" onClick={logout}>Sair</button>
        </div>
      </header>

      <section className="trash-hero">
        <div>
          <span className="trash-kicker">Administração do catálogo</span>
          <h1>Lixeira de peças</h1>
          <p>Peças arquivadas não aparecem para os vendedores. Aqui você pode restaurá-las ou removê-las definitivamente do Firestore e do Storage.</p>
        </div>
        <div className="trash-count">
          <strong>{garments.length}</strong>
          <span>arquivada(s)</span>
        </div>
      </section>

      {error && <div className="notice notice-error">{error}</div>}
      {!error && message && <div className="notice notice-success">{message}</div>}

      {loading ? (
        <div className="panel trash-empty">Carregando peças arquivadas…</div>
      ) : garments.length === 0 ? (
        <div className="panel trash-empty">
          <strong>A lixeira está vazia.</strong>
          <span>Nenhuma peça arquivada no momento.</span>
        </div>
      ) : (
        <section className="trash-grid">
          {garments.map((garment) => {
            const thumb = garment.images?.front || garment.images?.combined || garment.images?.back;
            const working = actionId === garment.id;

            return (
              <article className="panel trash-card" key={garment.id}>
                <div className="trash-card-image">
                  {thumb ? <img src={thumb} alt={garment.name} /> : <span>Sem imagem</span>}
                </div>
                <div className="trash-card-body">
                  <span className="trash-status">Arquivada</span>
                  <h2>{garment.name}</h2>
                  <code>{garment.id}</code>
                  <p>Pedidos históricos não serão apagados por nenhuma ação desta tela.</p>
                  <div className="trash-card-actions">
                    <button className="button button-success" type="button" disabled={working} onClick={() => restoreGarment(garment)}>
                      {working ? 'Processando…' : 'Restaurar peça'}
                    </button>
                    <button className="button order-delete-button" type="button" disabled={working} onClick={() => deleteForever(garment)}>
                      {working ? 'Processando…' : 'Excluir permanentemente'}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}

export default function GarmentTrashPage() {
  return <AdminAuth>{({ logout }) => <TrashWorkspace logout={logout} />}</AdminAuth>;
}
