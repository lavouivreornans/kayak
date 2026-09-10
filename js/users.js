// ============================================================================
// Utilisateurs (moniteurs & adhérents) — CRUD
// ============================================================================
import * as store from "./store.js";
import { uuid } from "./sessions.js";

export function listerUtilisateurs() {
  return store
    .getAllRecords(store.COLLECTIONS.utilisateurs)
    .sort((a, b) => `${a.nom}${a.prenom}`.localeCompare(`${b.nom}${b.prenom}`));
}

export function listerMoniteurs() {
  return listerUtilisateurs().filter((u) => u.role === "moniteur");
}

export function listerAdherents() {
  return listerUtilisateurs().filter((u) => u.role === "adherent");
}

export function obtenirUtilisateur(id) {
  return store.getRecord(store.COLLECTIONS.utilisateurs, id);
}

export function trouverParEmail(email) {
  return listerUtilisateurs().find((u) => (u.email || "").toLowerCase() === (email || "").toLowerCase());
}

export async function enregistrerUtilisateur(utilisateur) {
  const id = utilisateur.id || uuid();
  const toSave = {
    ...utilisateur,
    id,
    createdAt: utilisateur.createdAt || new Date().toISOString(),
  };
  return store.saveRecord(store.COLLECTIONS.utilisateurs, id, toSave);
}

/** Crée automatiquement un profil "moniteur" pour la personne connectée si absent. */
export async function assurerProfilPourConnexion(profileGoogle) {
  const existant = trouverParEmail(profileGoogle.email);
  if (existant) return existant;
  return enregistrerUtilisateur({
    email: profileGoogle.email,
    prenom: profileGoogle.given_name || profileGoogle.name || "",
    nom: profileGoogle.family_name || "",
    role: "moniteur",
    pagaieActuelle: null,
    actif: true,
  });
}
