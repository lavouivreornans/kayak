// ============================================================================
// Authentification Google (Google Identity Services) + gestion du token OAuth
// ============================================================================
import { CONFIG } from "./config.js";

const TOKEN_KEY = "edp_google_token";
const PROFILE_KEY = "edp_google_profile";

let tokenClient = null;
let onAuthChangeCallbacks = [];

function loadStoredToken() {
  try {
    const raw = sessionStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.expiresAt && Date.now() < data.expiresAt) return data;
    return null;
  } catch {
    return null;
  }
}

function storeToken(tokenResponse) {
  const data = {
    accessToken: tokenResponse.access_token,
    expiresAt: Date.now() + (Number(tokenResponse.expires_in) || 3500) * 1000,
  };
  sessionStorage.setItem(TOKEN_KEY, JSON.stringify(data));
  return data;
}

export function getStoredProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function storeProfile(profile) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

export function onAuthChange(cb) {
  onAuthChangeCallbacks.push(cb);
}

function notifyAuthChange(signedIn) {
  onAuthChangeCallbacks.forEach((cb) => cb(signedIn));
}

/** Charge dynamiquement le script Google Identity Services une seule fois. */
function loadGisScript() {
  return new Promise((resolve, reject) => {
    if (window.google && window.google.accounts && window.google.accounts.oauth2) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Impossible de charger Google Identity Services (hors ligne ?)"));
    document.head.appendChild(script);
  });
}

async function fetchProfile(accessToken) {
  const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error("Impossible de récupérer le profil Google");
  return res.json();
}

/** Initialise le client OAuth. À appeler au démarrage de l'app. */
export async function initAuth() {
  await loadGisScript();
  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.GOOGLE_CLIENT_ID,
    scope: CONFIG.GOOGLE_SCOPES,
    callback: () => {}, // remplacé à chaque appel de signIn()
  });
}

/** Retourne un token d'accès valide, ou null si l'utilisateur n'est pas connecté. */
export function getAccessToken() {
  const stored = loadStoredToken();
  return stored ? stored.accessToken : null;
}

export function isSignedIn() {
  return !!getAccessToken();
}

/** Ouvre la fenêtre de connexion Google. Résout avec le profil utilisateur. */
export function signIn({ silent = false } = {}) {
  return new Promise((resolve, reject) => {
    if (!tokenClient) {
      reject(new Error("Authentification non initialisée"));
      return;
    }
    tokenClient.callback = async (resp) => {
      if (resp.error) {
        reject(new Error(resp.error_description || resp.error));
        return;
      }
      storeToken(resp);
      try {
        const profile = await fetchProfile(resp.access_token);
        storeProfile(profile);
        notifyAuthChange(true);
        resolve(profile);
      } catch (e) {
        reject(e);
      }
    };
    tokenClient.requestAccessToken({ prompt: silent ? "" : "consent" });
  });
}

/** Tente un renouvellement silencieux du token (pas de fenêtre visible si déjà autorisé). */
export function signInSilent() {
  return new Promise((resolve) => {
    if (!tokenClient) {
      resolve(null);
      return;
    }
    tokenClient.callback = async (resp) => {
      if (resp.error) {
        resolve(null);
        return;
      }
      storeToken(resp);
      try {
        const profile = await fetchProfile(resp.access_token);
        storeProfile(profile);
        notifyAuthChange(true);
        resolve(profile);
      } catch {
        resolve(null);
      }
    };
    try {
      tokenClient.requestAccessToken({ prompt: "none" });
    } catch {
      resolve(null);
    }
  });
}

export function signOut() {
  const token = getAccessToken();
  sessionStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(PROFILE_KEY);
  if (token && window.google && window.google.accounts) {
    window.google.accounts.oauth2.revoke(token, () => {});
  }
  notifyAuthChange(false);
}
