import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type Auth,
  type User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

export const DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.readonly',
];

let app: FirebaseApp;
if (getApps().length === 0) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0];
}

const auth: Auth = getAuth(app);

const provider = new GoogleAuthProvider();
for (const scope of DRIVE_SCOPES) {
  provider.addScope(scope);
}
provider.setCustomParameters({ prompt: 'select_account' });

let isSigningIn = false;
// In-memory access token cache only (never persisted in localStorage/sessionStorage)
let cachedAccessToken: string | null = null;

export function initGoogleAuth(
  onAuthSuccess?: (user: User, accessToken: string) => void,
  onAuthCleared?: (user: User | null) => void
) {
  return onAuthStateChanged(auth, (user) => {
    if (user && cachedAccessToken) {
      onAuthSuccess?.(user, cachedAccessToken);
    } else if (!isSigningIn) {
      if (!user) {
        cachedAccessToken = null;
      }
      onAuthCleared?.(user);
    }
  });
}

export async function signInWithGoogleDrive(): Promise<{
  user: User;
  accessToken: string;
  idToken: string;
}> {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Gagal mendapatkan izin akses Google Drive.');
    }
    const idToken = await result.user.getIdToken();
    cachedAccessToken = credential.accessToken;
    return {
      user: result.user,
      accessToken: cachedAccessToken,
      idToken,
    };
  } catch (err) {
    const code =
      typeof err === 'object' && err !== null && 'code' in err
        ? String((err as { code?: unknown }).code)
        : '';
    if (code === 'auth/unauthorized-domain') {
      const host =
        typeof window !== 'undefined' ? window.location.hostname : 'domain ini';
      throw new Error(
        `Domain "${host}" belum didaftarkan di Firebase Authentication. Tambahkan domain Vercel Anda di Firebase Console -> Authentication -> Settings -> Authorized domains, atau masuk dengan Passcode Panitia.`
      );
    }
    if (code === 'auth/popup-blocked') {
      throw new Error(
        'Popup login Google diblokir oleh browser. Izinkan popup untuk situs ini lalu coba lagi.'
      );
    }
    if (code === 'auth/popup-closed-by-user') {
      throw new Error('Jendela login Google ditutup sebelum proses masuk selesai.');
    }
    throw err;
  } finally {
    isSigningIn = false;
  }
}

export function getCachedDriveAccessToken(): string | null {
  return cachedAccessToken;
}

export async function signOutGoogle(): Promise<void> {
  cachedAccessToken = null;
  await signOut(auth);
}
