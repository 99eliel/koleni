import { getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

export const firebaseConfig = {
  apiKey: 'AIzaSyCTEmqxiRR6SbzZDcqnn0wMrPvm2IFSDXw',
  authDomain: 'upagro-caa98.firebaseapp.com',
  databaseURL: 'https://upagro-caa98-default-rtdb.firebaseio.com',
  projectId: 'upagro-caa98',
  storageBucket: 'upagro-caa98.firebasestorage.app',
  messagingSenderId: '364703805987',
  appId: '1:364703805987:web:8c75b8931a48b3f7c63796',
  measurementId: 'G-GG4CLWL3QB',
};

const app = getApps()[0] ?? initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const isFirebaseConfigured = true;
export { app };
