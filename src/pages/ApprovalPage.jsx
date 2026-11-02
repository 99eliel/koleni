import { useEffect, useMemo, useState } from 'react';
import { doc, getDoc, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { useParams } from 'react-router-dom';
import MartinpelBrand from '../components/MartinpelBrand';
import OrderPieces from '../components/OrderPieces';
import { db } from '../lib/firebase';
import '../approval.css';

const VIEW_LABELS = { front: 'Foto 1', back: 'Foto 2', combined: 'Foto 3' };

export default function ApprovalPage() {
  const { orderId, token } = useParams();
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [decision, setDecision] = useState('');

  const artworks = useMemo(() => {
    const items = Object.entries(preview?.finalImages || {}).filter(([, url]) => Boolean(url));
    if (!items.length && preview?.finalImageUrl) return [['final', preview.finalImageUrl]];
    return items;
  }, [preview]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    getDoc(doc(db, 'approvalPreviews', token))
      .then((snapshot) => {
        if (!active) return;
        if (!snapshot.exists() || snapshot.data()?.orderId !== orderId) {
          throw new Error('Este link de aprovação não é válido ou expirou.');
        }
        const data = snapshot.data();
        setPreview(data);
        setDecision(data.status === 'approved' || data.status === 'changes_requested' ? data.status : '');
        setNote(data.note || '');
      })
      .catch((err) => active && setError(err.message))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [orderId, token]);

  async function respond(nextDecision) {
    if (decision) return;
    if (nextDecision === 'changes_requested' && !note.trim()) {
      setError('Escreva o que precisa ser alterado antes de solicitar uma mudança.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const nextStatus = nextDecision === 'approved' ? 'approved' : 'approval';
      const cleanNote = note.trim();

      const batch = writeBatch(db);
      batch.update(doc(db, 'orders', orderId), {
        approvalProof: token,
        approvalStatus: nextDecision,
        approvalNote: cleanNote,
        approvalRespondedAt: serverTimestamp(),
        status: nextStatus,
        updatedAt: serverTimestamp(),
      });
      batch.update(doc(db, 'approvalPreviews', token), {
        status: nextDecision,
        note: cleanNote,
        respondedAt: serverTimestamp(),
      });
      await batch.commit();

      setDecision(nextDecision);

      if (preview?.sellerUid) {
        updateDoc(doc(db, 'sellerOrders', preview.sellerUid, 'orders', orderId), {
          approvalProof: token,
          approvalStatus: nextDecision,
          approvalNote: cleanNote,
          status: nextStatus,
          updatedAt: serverTimestamp(),
        }).catch((syncError) => {
          console.warn('Não foi possível sincronizar o resumo do vendedor.', syncError);
        });
      }
    } catch (err) {
      setError(`Não foi possível registrar a resposta: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <main className="approval-screen"><div className="approval-loading">Carregando arte para aprovação…</div></main>;

  if (error && !preview) {
    return (
      <main className="approval-screen">
        <section className="approval-card approval-error-card">
          <header className="approval-brand"><MartinpelBrand compact subtitle="Aprovação de arte" /></header>
          <h1>Link indisponível</h1>
          <p>{error}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="approval-screen">
      <section className="approval-card">
        <header className="approval-brand"><MartinpelBrand compact subtitle="Aprovação de arte" /></header>
        <div className="approval-heading">
          <span>Pedido {preview?.displayCode || orderId}</span>
          <h1>Confira a personalização</h1>
          <p>Confira todas as fotos abaixo. A aprovação vale para todas as peças desta versão do pedido.</p>
        </div>

        <div className="approval-meta">
          <div><span>Cliente</span><strong>{preview?.customerName || 'Cliente'}</strong></div>
          <div><span>Peça</span><strong>{(preview?.items || []).length > 1 ? `${preview.items.length} modelos personalizados` : preview?.garmentName || 'Uniforme personalizado'}</strong></div>
          <div><span>Quantidade</span><strong>{preview?.quantity || 0}</strong></div>
          <div><span>Versão</span><strong>V{preview?.designVersion || 1}</strong></div>
        </div>

        <OrderPieces order={preview} detailed />
        {(preview?.items?.length || 0) <= 1 && <div className={`approval-art-grid ${artworks.length === 1 ? 'is-single' : ''}`}>
          {artworks.length > 0 ? artworks.map(([imageView, url], index) => (
            <figure className="approval-art" key={imageView}>
              <img src={url} alt={`Arte para aprovação - ${VIEW_LABELS[imageView] || `Foto ${index + 1}`}`} />
              <figcaption>{VIEW_LABELS[imageView] || `Foto ${index + 1}`}</figcaption>
            </figure>
          )) : <div className="approval-art"><div>Arte indisponível</div></div>}
        </div>}

        {(preview?.items?.length || 0) <= 1 ? null : <p className="approval-multi-note">Ao aprovar, você confirma todas as personalizações acima. Para solicitar mudanças, indique a peça e a foto na observação.</p>}
        {decision ? (
          <div className={`approval-result ${decision === 'approved' ? 'approved' : 'changes'}`}>
            <strong>{decision === 'approved' ? '✓ Arte aprovada' : '↺ Alteração solicitada'}</strong>
            <p>{decision === 'approved' ? 'A Koleni já pode seguir com o fluxo interno deste pedido.' : 'A equipe Koleni recebeu sua solicitação de alteração.'}</p>
            {decision === 'changes_requested' && note && <p><strong>Solicitação registrada:</strong> {note}</p>}
          </div>
        ) : (
          <>
            <label className="approval-note">Observação para a equipe <span>(necessária apenas se pedir alteração)</span>
              <textarea rows="3" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ex.: aumentar a logo na Foto 2; trocar a cor da manga; alterar o número..." disabled={busy} />
            </label>
            {error && <div className="approval-inline-error">{error}</div>}
            <div className="approval-actions">
              <button type="button" className="approval-change" onClick={() => respond('changes_requested')} disabled={busy}>Solicitar alteração</button>
              <button type="button" className="approval-approve" onClick={() => respond('approved')} disabled={busy}>{busy ? 'Registrando…' : 'Aprovar arte'}</button>
            </div>
          </>
        )}

        <footer>Koleni · Aprovação vinculada somente a este pedido e a esta versão completa da arte.</footer>
      </section>
    </main>
  );
}