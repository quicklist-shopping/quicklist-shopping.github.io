import { GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { auth } from './client';

const allowedEmails = new Set(
  (import.meta.env.VITE_ALLOWED_EMAILS || '')
    .split(',')
    .map((email: string) => email.trim().toLowerCase())
    .filter(Boolean),
);

export function isAllowedUser(user: User): boolean {
  const isGoogleUser = user.providerData.some((provider) => provider.providerId === 'google.com');
  return Boolean(user.emailVerified && user.email && isGoogleUser && allowedEmails.has(user.email.toLowerCase()));
}

export async function signInWithGoogle(): Promise<void> {
  if (!auth) throw new Error('Firebase is not configured.');
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  await signInWithPopup(auth, provider);
}

export async function signOutUser(): Promise<void> {
  if (auth) await signOut(auth);
}
