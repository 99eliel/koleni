import { deleteApp, getApps, initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
  inMemoryPersistence,
  setPersistence,
  signOut,
} from 'firebase/auth';
import { firebaseConfig } from './firebase';
import { saveStaffProfile } from './staffRepo';

const PROVISIONING_APP_NAME = 'koleni-staff-provisioning';

function cleanEmailAddress(value) {
  return String(value || '').trim().toLowerCase();
}

function authErrorMessage(error) {
  const code = error?.code || '';
  if (code === 'auth/email-already-in-use') return 'Já existe uma conta de acesso com este e-mail.';
  if (code === 'auth/invalid-email') return 'Informe um e-mail válido.';
  if (code === 'auth/weak-password') return 'A senha é muito fraca. Use pelo menos 8 caracteres.';
  if (code === 'auth/operation-not-allowed') {
    return 'O login por E-mail/Senha ainda não está habilitado no Firebase Authentication.';
  }
  if (code === 'auth/too-many-requests') {
    return 'O Firebase bloqueou temporariamente novas tentativas. Aguarde alguns minutos e tente novamente.';
  }
  return error?.message || 'Não foi possível criar a conta do funcionário.';
}

function getProvisioningApp() {
  return getApps().find((item) => item.name === PROVISIONING_APP_NAME)
    || initializeApp(firebaseConfig, PROVISIONING_APP_NAME);
}

export async function createStaffAccount({ name, email, password, role, active = true }) {
  const cleanName = String(name || '').trim();
  const cleanEmail = cleanEmailAddress(email);
  const cleanPassword = String(password || '');

  if (!cleanName) throw new Error('Informe o nome do funcionário.');
  if (!cleanEmail || !cleanEmail.includes('@')) throw new Error('Informe um e-mail válido.');
  if (cleanPassword.length < 8) throw new Error('A senha deve ter pelo menos 8 caracteres.');

  const provisioningApp = getProvisioningApp();
  const provisioningAuth = getAuth(provisioningApp);
  let createdUser = null;

  try {
    await setPersistence(provisioningAuth, inMemoryPersistence);
    const credential = await createUserWithEmailAndPassword(
      provisioningAuth,
      cleanEmail,
      cleanPassword,
    );
    createdUser = credential.user;

    try {
      await saveStaffProfile(createdUser.uid, {
        name: cleanName,
        email: cleanEmail,
        role,
        active,
      });
    } catch (error) {
      await deleteUser(createdUser).catch(() => {});
      createdUser = null;
      throw error;
    }

    return {
      uid: createdUser.uid,
      email: cleanEmail,
    };
  } catch (error) {
    throw new Error(authErrorMessage(error));
  } finally {
    try { await signOut(provisioningAuth); } catch {}
    try { await deleteApp(provisioningApp); } catch {}
  }
}
