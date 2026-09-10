// ============================================================================
// Évaluations de progression (Pagaies Couleurs) — indépendantes des séances,
// pour que les moniteurs puissent faire le point à tout moment. Les critères
// sont identifiés par leur "cle" (stable, partagée entre parcours quand un
// critère est commun à la rando et à l'eau vive).
// ============================================================================
import * as store from "./store.js";
import { uuid } from "./sessions.js";

export function listerEvaluations() {
  return store.getAllRecords(store.COLLECTIONS.evaluations);
}

export function evaluationsPourAdherent(adherentId) {
  return listerEvaluations().filter((e) => e.adherentId === adherentId);
}

/** Fusionne (ne remplace jamais) les critères validés (par "cle") pour un adhérent. */
export async function validerCriteres(adherentId, cles, { moniteurId = null, note = "" } = {}) {
  const dejaValidees = new Set(evaluationsPourAdherent(adherentId).flatMap((e) => e.clesValidees || []));
  const nouvelles = cles.filter((c) => !dejaValidees.has(c));

  if (!nouvelles.length && !note) return null; // rien de nouveau à enregistrer

  const id = uuid();
  return store.saveRecord(store.COLLECTIONS.evaluations, id, {
    id,
    adherentId,
    clesValidees: cles,
    moniteurId,
    note,
    date: new Date().toISOString(),
  });
}
