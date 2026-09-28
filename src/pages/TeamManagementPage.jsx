import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminAuth from '../components/AdminAuth';
import MartinpelBrand from '../components/MartinpelBrand';
import { listStaff, saveStaffProfile, setStaffActive, setStaffRole, STAFF_ROLES } from '../lib/staffRepo';

const EMPTY_FORM = { uid: '', name: '', email: '', role: 'seller', active: true };

function TeamManagement({ user, profile, legacyAccess, logout }) {
  const [members, setMembers] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionUid, setActionUid] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      setMembers(await listStaff());
    } catch (err) {
      setError(`Não foi possível carregar a equipe: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function migrateCurrentAdmin() {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await saveStaffProfile(user.uid, {
        name: profile?.name || user.displayName || 'Administrador',
        email: user.email || profile?.email || '',
        role: 'admin',
        active: true,
      });
      await load();
      setMessage('Sua conta foi migrada para a nova estrutura de equipe.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function submit(event) {
    event.preventDefault();
    const cleanUid = form.uid.trim();
    if (cleanUid === user.uid && (form.role !== 'admin' || form.active !== true)) {
      setError('Sua própria conta deve permanecer ativa como Administrador.');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');
    try {
      await saveStaffProfile(cleanUid, form);
      setForm(EMPTY_FORM);
      await load();
      setMessage('Membro da equipe salvo com sucesso.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function changeRole(member, role) {
    if (member.uid === user.uid && role !== 'admin') {
      setError('Você não pode remover sua própria função de Administrador. Use outra conta administrativa para isso.');
      return;
    }
    setActionUid(member.uid);
    setError('');
    try {
      await setStaffRole(member.uid, role);
      setMembers((items) => items.map((item) => item.uid === member.uid ? { ...item, role } : item));
    } catch (err) {
      setError(err.message);
    } finally {
      setActionUid('');
    }
  }

  async function toggleActive(member) {
    if (member.uid === user.uid) {
      setError('Você não pode bloquear sua própria conta administrativa.');
      return;
    }
    setActionUid(member.uid);
    setError('');
    try {
      const active = member.active !== true;
      await setStaffActive(member.uid, active);
      setMembers((items) => items.map((item) => item.uid === member.uid ? { ...item, active } : item));
    } catch (err) {
      setError(err.message);
    } finally {
      setActionUid('');
    }
  }

  return (
    <main className="team-shell">
      <header className="team-topbar">
        <MartinpelBrand compact subtitle="Gestão da equipe" />
        <div className="team-topbar-actions">
          <Link className="button button-light" to="/admin">Painel administrativo</Link>
          <button className="button admin-logout-button" type="button" onClick={logout}>Sair</button>
        </div>
      </header>

      <section className="team-hero panel">
        <div>
          <p className="eyebrow">Segurança e acessos</p>
          <h1>Equipe Martinpel</h1>
          <p>Somente usuários presentes aqui, ativos e com a função correta, podem usar as áreas internas do sistema.</p>
        </div>
        <div className="team-summary">
          <strong>{members.filter((member) => member.active === true).length}</strong>
          <span>acesso(s) ativo(s)</span>
        </div>
      </section>

      {legacyAccess && (
        <section className="panel team-migration-card">
          <div>
            <strong>Migrar sua conta administrativa</strong>
            <span>Sua conta ainda usa o cadastro antigo em admins/{'{uid}'}. Migre agora para staff/{'{uid}'} antes de removermos a compatibilidade.</span>
          </div>
          <button className="button button-primary" type="button" onClick={migrateCurrentAdmin} disabled={saving}>
            {saving ? 'Migrando…' : 'Migrar minha conta'}
          </button>
        </section>
      )}

      {(error || message) && <div className={error ? 'notice notice-error' : 'notice notice-success'}>{error || message}</div>}

      <section className="team-layout">
        <form className="panel team-form" onSubmit={submit}>
          <div>
            <p className="eyebrow">Novo acesso</p>
            <h2>Vincular usuário</h2>
            <p>Crie primeiro o usuário no Firebase Authentication e cole aqui o UID gerado.</p>
          </div>
          <label>UID do Firebase Authentication
            <input value={form.uid} onChange={(event) => setForm((current) => ({ ...current, uid: event.target.value }))} placeholder="Ex.: kP7...9xQ" disabled={saving} />
          </label>
          <label>Nome do funcionário
            <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Nome completo" disabled={saving} />
          </label>
          <label>E-mail
            <input type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} placeholder="vendedor@martinpel.com.br" disabled={saving} />
          </label>
          <label>Função
            <select value={form.role} onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))} disabled={saving}>
              {Object.entries(STAFF_ROLES).map(([role, label]) => <option key={role} value={role}>{label}</option>)}
            </select>
          </label>
          <label className="team-active-check"><input type="checkbox" checked={form.active} onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))} disabled={saving} /> Liberar acesso imediatamente</label>
          <button className="button button-primary" type="submit" disabled={saving}>{saving ? 'Salvando…' : 'Salvar acesso'}</button>
        </form>

        <section className="panel team-list-panel">
          <div className="team-list-head">
            <div><p className="eyebrow">Acessos cadastrados</p><h2>{members.length} membro(s)</h2></div>
            <button className="button button-secondary" type="button" onClick={load} disabled={loading}>{loading ? 'Atualizando…' : 'Atualizar'}</button>
          </div>

          {!loading && members.length === 0 && <div className="team-empty">Nenhum perfil em staff ainda. Migre sua conta e cadastre a equipe.</div>}

          <div className="team-list">
            {members.map((member) => {
              const working = actionUid === member.uid;
              const own = member.uid === user.uid;
              return (
                <article className={`team-member ${member.active === true ? '' : 'is-blocked'}`} key={member.uid}>
                  <div className="team-member-main">
                    <div className="team-avatar">{String(member.name || member.email || '?').slice(0, 1).toUpperCase()}</div>
                    <div><strong>{member.name || 'Sem nome'}</strong><span>{member.email || 'Sem e-mail'}</span><code>{member.uid}</code></div>
                  </div>
                  <div className="team-member-controls">
                    <select value={member.role || 'seller'} onChange={(event) => changeRole(member, event.target.value)} disabled={working || own}>
                      {Object.entries(STAFF_ROLES).map(([role, label]) => <option key={role} value={role}>{label}</option>)}
                    </select>
                    <button className={`button ${member.active === true ? 'button-secondary' : 'button-success'}`} type="button" onClick={() => toggleActive(member)} disabled={working || own}>
                      {working ? 'Salvando…' : member.active === true ? 'Bloquear' : 'Ativar'}
                    </button>
                  </div>
                  <div className={`team-status ${member.active === true ? 'is-active' : 'is-blocked'}`}>{member.active === true ? 'Ativo' : 'Bloqueado'}{own ? ' · sua conta' : ''}</div>
                </article>
              );
            })}
          </div>
        </section>
      </section>
    </main>
  );
}

export default function TeamManagementPage() {
  return <AdminAuth>{(props) => <TeamManagement {...props} />}</AdminAuth>;
}
