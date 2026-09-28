import { getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

export const firebaseConfig = {
  apiKey: 'AIzaSyBQ0QQuOzXx1IkbxV1UYF_UmntmTkMV-Wk',
  authDomain: 'personalizamartinpel.firebaseapp.com',
  projectId: 'personalizamartinpel',
  storageBucket: 'personalizamartinpel.firebasestorage.app',
  messagingSenderId: '696874446840',
  appId: '1:696874446840:web:d9efa7c76a9395234f300d',
  measurementId: 'G-0MW8NXLTDX',
};

const app = getApps()[0] ?? initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const isFirebaseConfigured = true;
export { app };
