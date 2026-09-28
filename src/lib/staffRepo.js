import { collection, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';

export const STAFF_ROLES = {
  admin: 'Administrador',
  seller: 'Vendedor',
  production: 'Produção',
};

function normalizeLegacyRole(data = {}) {
  const rawRole = String(data.role || data.tipo || '').trim().toLowerCase();
  if (rawRole === 'admin' || rawRole === 'administrador') return 'admin';
  if (rawRole === 'seller' || rawRole === 'vendedor') return 'seller';
  if (rawRole === 'production' || rawRole === 'producao' || rawRole === 'produção') return 'production';
  return '';
}

function normalizeLegacyActive(data = {}) {
  if (typeof data.active === 'boolean') return data.active;
  if (typeof data.ativo === 'boolean') return data.ativo;
  return false;
}

function profileFromLegacy(user, data = {}, role = '') {
  return {
    uid: user.uid,
    name: data.name || data.nome || user.displayName || 'Usuário',
    email: data.email || user.email || '',
    role,
    active: normalizeLegacyActive(data),
    ...data,
  };
}

export async function getStaffAccess(user) {
  if (!user?.uid) return { allowed: false, active: false, role: '', profile: null, legacy: false };

  const staffSnapshot = await getDoc(doc(db, 'staff', user.uid));
  if (staffSnapshot.exists()) {
    const data = staffSnapshot.data();
    const role = STAFF_ROLES[data.role] ? data.role : '';
    const active = data.active === true;
    return {
      allowed: Boolean(active && role),
      active,
      role,
      profile: { uid: user.uid, ...data },
      legacy: false,
    };
  }

  // Compatibilidade com os dados já existentes no Firebase antigo.
  // Aceita tanto role/active quanto tipo/ativo.
  const legacyAdmin = await getDoc(doc(db, 'admins', user.uid));
  if (legacyAdmin.exists()) {
    const data = legacyAdmin.data();
    const role = normalizeLegacyRole(data);
    const active = normalizeLegacyActive(data);
    if (role === 'admin' && active) {
      return {
        allowed: true,
        active: true,
        role: 'admin',
        profile: profileFromLegacy(user, data, 'admin'),
        legacy: true,
      };
    }
  }

  // Segunda compatibilidade: alguns projetos antigos guardavam o perfil
  // principal em usuarios/{uid} com tipo e ativo.
  const legacyUser = await getDoc(doc(db, 'usuarios', user.uid));
  if (legacyUser.exists()) {
    const data = legacyUser.data();
    const role = normalizeLegacyRole(data);
    const active = normalizeLegacyActive(data);
    if (active && STAFF_ROLES[role]) {
      return {
        allowed: true,
        active: true,
        role,
        profile: profileFromLegacy(user, data, role),
        legacy: true,
      };
    }
  }

  return { allowed: false, active: false, role: '', profile: null, legacy: false };
}

export async function listStaff() {
  const snapshot = await getDocs(collection(db, 'staff'));
  return snapshot.docs
    .map((item) => ({ uid: item.id, ...item.data() }))
    .sort((a, b) => String(a.name || a.email || '').localeCompare(String(b.name || b.email || ''), 'pt-BR'));
}

export async function saveStaffProfile(uid, data) {
  const cleanUid = String(uid || '').trim();
  const cleanName = String(data?.name || '').trim();
  const cleanEmail = String(data?.email || '').trim().toLowerCase();
  const role = STAFF_ROLES[data?.role] ? data.role : '';

  if (!cleanUid) throw new Error('Informe o UID do usuário criado no Firebase Authentication.');
  if (!cleanName) throw new Error('Informe o nome do funcionário.');
  if (!cleanEmail || !cleanEmail.includes('@')) throw new Error('Informe um e-mail válido.');
  if (!role) throw new Error('Selecione uma função válida.');

  await setDoc(doc(db, 'staff', cleanUid), {
    name: cleanName,
    email: cleanEmail,
    role,
    active: data?.active !== false,
    updatedAt: serverTimestamp(),
  }, { merge: true });

  return cleanUid;
}

export async function setStaffActive(uid, active) {
  await updateDoc(doc(db, 'staff', uid), {
    active: Boolean(active),
    updatedAt: serverTimestamp(),
  });
}

export async function setStaffRole(uid, role) {
  if (!STAFF_ROLES[role]) throw new Error('Função inválida.');
  await updateDoc(doc(db, 'staff', uid), {
    role,
    updatedAt: serverTimestamp(),
  });
}
