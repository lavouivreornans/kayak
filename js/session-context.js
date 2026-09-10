// ============================================================================
// Petit registre partagé du profil Google actuellement connecté, pour éviter
// les imports circulaires entre app.js et les écrans.
// ============================================================================
import { getStoredProfile } from "./auth.js";

let profile = getStoredProfile();

export function setCurrentProfile(p) {
  profile = p;
}

export function currentProfile() {
  return profile;
}
