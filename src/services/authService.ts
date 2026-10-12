import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  signInAnonymously,
  signOut,
  User,
} from 'firebase/auth';
import { auth } from './firebase';

const actionCodeSettings = {
  url: 'https://sapthanest.firebaseapp.com/verified',
  handleCodeInApp: false,
};

/**
 * Signs up with email/password and sends confirmation link.
 * Signs out immediately until the email is confirmed.
 */
export const registerWithVerification = async (
  email: string,
  pass: string
): Promise<void> => {
  const cred = await createUserWithEmailAndPassword(auth, email.trim(), pass);
  await sendEmailVerification(cred.user, actionCodeSettings);
  await signOut(auth);
};

/**
 * Signs in regular email/password users and checks confirmed email status.
 */
export const loginWithVerifiedCheck = async (
  email: string,
  pass: string
): Promise<User> => {
  const cred = await signInWithEmailAndPassword(auth, email.trim(), pass);
  await cred.user.reload();

  if (!cred.user.emailVerified) {
    await signOut(auth);
    throw new Error('EMAIL_NOT_VERIFIED');
  }

  return cred.user;
};

/**
 * Signs in as a guest (Anonymous Authentication).
 */
export const loginAsGuest = async (): Promise<User> => {
  const cred = await signInAnonymously(auth);
  return cred.user;
};

/**
 * Resends the verification email.
 */
export const resendVerificationEmail = async (
  email: string,
  pass: string
): Promise<void> => {
  const cred = await signInWithEmailAndPassword(auth, email.trim(), pass);
  await sendEmailVerification(cred.user, actionCodeSettings);
  await signOut(auth);
};

/**
 * Logs out the current session (guest or registered user).
 */
export const logoutUser = async (): Promise<void> => {
  await signOut(auth);
};