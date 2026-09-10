// ============================================================================
// Progression FFCK — Pagaies Couleurs
// ----------------------------------------------------------------------------
// Le référentiel a un tronc commun (Blanche, Jaune) puis deux parcours
// distincts à partir de la Verte : "eauvive" (Rivière Sportive) et "rando"
// (Descente). Certains critères sont identiques dans les deux parcours (même
// texte, même "cle" explicite dans le JSON) : les valider d'un côté les
// valide automatiquement de l'autre, car la validation est stockée par "cle"
// et non par niveau.
// ============================================================================
import * as evaluationsApi from "./evaluations.js";

/** Aplatit un niveau du référentiel en une liste de {capacite, categorie, critere, cle}. */
export function critereListe(niveau) {
  const out = [];
  for (const cap of niveau.capacites || []) {
    for (const cat of cap.categories || []) {
      for (const item of cat.criteres || []) {
        const estObjet = typeof item === "object" && item !== null;
        const critere = estObjet ? item.texte : item;
        const cle = estObjet && item.cle ? item.cle : `${niveau.id}::${critere}`;
        const partage = estObjet && !!item.cle;
        out.push({ capacite: cap.nom, categorie: cat.nom, critere, cle, partage });
      }
    }
  }
  return out;
}

/** Tous les niveaux du référentiel, à plat, avec leur "famille" d'origine. */
export function tousLesNiveaux(referentiel) {
  const niveaux = [...(referentiel.troncCommun || []).map((n) => ({ ...n, _famille: "tronc" }))];
  for (const p of referentiel.parcours || []) {
    for (const n of p.niveaux || []) {
      niveaux.push({ ...n, _famille: p.id });
    }
  }
  return niveaux;
}

/** Ensemble des "cle" validées pour un adhérent, tous parcours confondus. */
function clesValideesPour(adherentId, evaluations) {
  const valides = new Set();
  for (const ev of evaluations) {
    if (ev.adherentId === adherentId) {
      (ev.clesValidees || []).forEach((c) => valides.add(c));
    }
  }
  return valides;
}

function calculerDetailNiveau(niveau, clesValidees) {
  const criteres = critereListe(niveau);
  const nbValides = criteres.filter((c) => clesValidees.has(c.cle)).length;
  const total = criteres.length;
  const pourcentage = total ? Math.round((nbValides / total) * 100) : 0;
  return {
    niveau,
    criteres: criteres.map((c) => ({ ...c, valide: clesValidees.has(c.cle) })),
    nbValides,
    total,
    pourcentage,
    complet: total > 0 && nbValides === total,
  };
}

function calculerChaine(niveaux, clesValidees) {
  const tries = [...niveaux].sort((a, b) => a.ordre - b.ordre);
  const detail = tries.map((n) => calculerDetailNiveau(n, clesValidees));
  let indexActuel = -1;
  detail.forEach((d, i) => {
    if (d.complet) indexActuel = i;
  });
  const enCours = indexActuel + 1 < detail.length ? detail[indexActuel + 1] : null;
  return {
    detail,
    niveauActuel: indexActuel >= 0 ? detail[indexActuel].niveau : null,
    niveauEnCours: enCours ? enCours.niveau : null,
    avancementNiveauEnCours: enCours ? enCours.pourcentage : null,
  };
}

/**
 * Calcule la progression complète d'un adhérent : le tronc commun (Blanche,
 * Jaune) puis, pour chaque parcours (eau vive / rando), sa propre chaîne de
 * niveaux à partir de la Verte.
 */
export function calculerProgression(referentiel, adherentId, evaluations = evaluationsApi.evaluationsPourAdherent(adherentId)) {
  const clesValidees = clesValideesPour(adherentId, evaluations);

  const tronc = calculerChaine(referentiel.troncCommun || [], clesValidees);

  const parcours = (referentiel.parcours || []).map((p) => {
    const chaine = calculerChaine(p.niveaux || [], clesValidees);
    return { id: p.id, nom: p.nom, icone: p.icone, ...chaine };
  });

  return { tronc, parcours };
}

/** Enregistre (fusion, pas d'écrasement) les critères validés — identifiés par leur "cle". */
export async function enregistrerEvaluation(adherentId, cles, options) {
  return evaluationsApi.validerCriteres(adherentId, cles, options);
}
