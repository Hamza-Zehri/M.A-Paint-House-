import { auth } from "./firebase";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updatePassword as fbUpdatePassword,
  type User as FirebaseUser,
} from "firebase/auth";
import type { User } from "./types";

export async function hashPassword(pw: string): Promise<string> {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(pw));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function emailOf(username: string) {
  const v = username.trim().toLowerCase();
  return v.includes("@") ? v : `${v}@mapainthouse.app`;
}

/**
 * The original bootstrap account shipped with weak default credentials.
 * It is permanently disabled in the app; use a real Firebase Auth account.
 */
export const DEFAULT_ADMIN_EMAIL = "admin@mapainthouse.app";

export function isDefaultAdminEmail(email?: string | null): boolean {
  return (email || "").trim().toLowerCase() === DEFAULT_ADMIN_EMAIL;
}

export function validatePassword(password: string): string | null {
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (!/[a-z]/.test(password)) return "Password must include a lowercase letter.";
  if (!/[A-Z]/.test(password)) return "Password must include an uppercase letter.";
  if (!/[0-9]/.test(password)) return "Password must include a number.";
  return null;
}

function profileFromAuth(fb: FirebaseUser, username: string): User {
  const raw = (username || "").trim();
  const emailLocal = fb.email?.split("@")[0] || "user";
  const uname = raw.includes("@") ? raw : raw || emailLocal;
  const display = fb.displayName || (raw.includes("@") ? emailLocal : uname);
  const roleKey = emailLocal.toLowerCase();
  return {
    id: fb.uid,
    username: uname,
    passwordHash: "",
    name: display,
    role: roleKey === "admin" || roleKey === "ceo" ? "admin" : "staff",
    active: true,
    createdAt: new Date().toISOString(),
  };
}

function friendlyAuthError(err: any): string {
  switch (err?.code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Incorrect username or password.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a minute and try again.";
    case "auth/network-request-failed":
      return "Network error. Check your internet connection and try again.";
    case "auth/invalid-email":
      return "That username can't be used. Use letters and numbers only.";
    case "auth/operation-not-allowed":
      return "Email/password sign-in is disabled in Firebase Authentication.";
    case "auth/email-already-in-use":
      return "This account already exists. Check the password and try again.";
    default:
      return err?.message || "Sign-in failed. Please try again.";
  }
}

export function waitForAuth(): Promise<FirebaseUser | null> {
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (u) => {
      unsub();
      resolve(u);
    });
  });
}

/**
 * Sign in with Firebase Authentication. This deliberately does not make any
 * Firestore requests, so a slow/unreachable Firestore can never block sign-in.
 */
export async function login(username: string, password: string): Promise<User> {
  const email = emailOf(username);
  if (isDefaultAdminEmail(email)) {
    throw new Error(
      "The default admin account has been disabled for security. Sign in with your own Firebase account (for example ceo@admin.com)."
    );
  }

  let cred;
  try {
    cred = await signInWithEmailAndPassword(auth, email, password);
  } catch (err: any) {
    throw new Error(friendlyAuthError(err));
  }

  // Defence in depth: never create or keep a session for the bootstrap account.
  if (isDefaultAdminEmail(cred.user.email)) {
    await signOut(auth);
    throw new Error(
      "The default admin account has been disabled for security. Sign in with your own Firebase account (for example ceo@admin.com)."
    );
  }

  const profile = profileFromAuth(cred.user, username);
  localStorage.setItem("maph_session", cred.user.uid);
  localStorage.setItem("maph_profile", JSON.stringify(profile));

  return profile;
}

export async function currentUser(): Promise<User | null> {
  const id = localStorage.getItem("maph_session");
  if (!id) return null;

  const cached = localStorage.getItem("maph_profile");
  if (cached) {
    try {
      const p = JSON.parse(cached) as User;
      if (p?.id === id) return p;
    } catch {
      // ignore malformed cache
    }
  }

  const fb = auth.currentUser;
  if (fb?.uid === id) {
    const profile = profileFromAuth(fb, fb.email?.split("@")[0] || "user");
    localStorage.setItem("maph_profile", JSON.stringify(profile));
    return profile;
  }

  return null;
}

export async function logout() {
  try {
    await signOut(auth);
  } catch {
    // ignore
  }
  localStorage.removeItem("maph_session");
  localStorage.removeItem("maph_profile");
}

export async function changePassword(userId: string, newPw: string) {
  const problem = validatePassword(newPw);
  if (problem) throw new Error(problem);
  if (!auth.currentUser) throw new Error("You must be signed in to change your password.");
  await fbUpdatePassword(auth.currentUser, newPw);
  const u = await currentUser();
  if (u && u.id === userId) {
    u.passwordHash = await hashPassword(newPw);
  }
}
