import { collection, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';

export const STAFF_ROLES = {
  admin: 'Administrador',
  seller: 'Vendedor',
  production: 'Produção',
};

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

  // Compatibilidade temporária: o administrador atual continua acessando
  // até que seu perfil seja migrado para staff/{uid}.
  const legacyAdmin = await getDoc(doc(db, 'admins', user.uid));
  if (legacyAdmin.exists() && legacyAdmin.data()?.role === 'admin') {
    return {
      allowed: true,
      active: true,
      role: 'admin',
      profile: {
        uid: user.uid,
        name: user.displayName || 'Administrador',
        email: user.email || '',
        role: 'admin',
        active: true,
      },
      legacy: true,
    };
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
