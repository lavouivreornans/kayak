// ============================================================================
// Classes de difficulté d'une rivière (échelle internationale I à VI),
// utilisées pour la saisie d'une séance et le résumé de pratique individuel.
// ============================================================================

// Ordre croissant de difficulté — sert à calculer un "maximum".
export const CLASSES_RIVIERE = ["Plate / Randonnée", "I", "II", "III", "IV", "V et +"];

/** Renvoie la classe la plus difficile d'une liste (ou null si vide/inconnue). */
export function classeMax(classes) {
  let meilleure = null;
  let meilleurIndex = -1;
  for (const c of classes) {
    const idx = CLASSES_RIVIERE.indexOf(c);
    if (idx > meilleurIndex) {
      meilleurIndex = idx;
      meilleure = c;
    }
  }
  return meilleure;
}
