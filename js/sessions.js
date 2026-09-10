// ============================================================================
// Séances — CRUD + agrégations pour les statistiques
// ============================================================================
import * as store from "./store.js";

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function listerSeances() {
  return store
    .getAllRecords(store.COLLECTIONS.seances)
    .sort((a, b) => (b.date + (b.heureDebut || "")).localeCompare(a.date + (a.heureDebut || "")));
}

export function obtenirSeance(id) {
  return store.getRecord(store.COLLECTIONS.seances, id);
}

export async function enregistrerSeance(seance) {
  const id = seance.id || uuid();
  const toSave = {
    ...seance,
    id,
    createdAt: seance.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  return store.saveRecord(store.COLLECTIONS.seances, id, toSave);
}

export async function supprimerSeance(id) {
  return store.deleteRecord(store.COLLECTIONS.seances, id);
}

// ---- statistiques -----------------------------------------------------
export function statistiques(seances = listerSeances()) {
  const parMois = {};
  const parRiviere = {};
  const parMeteo = {};
  let totalParticipants = 0;
  let debitCumule = 0;
  let debitCount = 0;

  for (const s of seances) {
    const mois = (s.date || "").slice(0, 7); // YYYY-MM
    if (mois) parMois[mois] = (parMois[mois] || 0) + 1;

    const riviere = s.lieu?.riviere || s.lieu?.nom || "Non renseigné";
    parRiviere[riviere] = (parRiviere[riviere] || 0) + 1;

    if (s.meteo?.description) {
      parMeteo[s.meteo.description] = (parMeteo[s.meteo.description] || 0) + 1;
    }

    totalParticipants += (s.participants || []).length;

    if (typeof s.debit?.valeur === "number") {
      debitCumule += s.debit.valeur;
      debitCount++;
    }
  }

  return {
    totalSeances: seances.length,
    totalParticipants,
    moyenneParticipants: seances.length ? Math.round((totalParticipants / seances.length) * 10) / 10 : 0,
    debitMoyen: debitCount ? Math.round((debitCumule / debitCount) * 100) / 100 : null,
    parMois,
    parRiviere,
    parMeteo,
  };
}

export function seancesParParticipant(adherentId, seances = listerSeances()) {
  return seances.filter((s) => (s.participants || []).some((p) => p.id === adherentId));
}

export { uuid };
