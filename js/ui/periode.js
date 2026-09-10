// ============================================================================
// Sélecteur de période réutilisable (Séances club + Progression individuelle)
// ----------------------------------------------------------------------------
// Quel que soit le préréglage choisi ("Cette année", "12 derniers mois"…), les
// dates de début/fin réellement appliquées sont toujours affichées dans les
// champs — même quand elles ne sont pas éditables — pour que l'utilisateur
// puisse confirmer visuellement la période prise en compte.
// ============================================================================

/** Calcule {debut, fin} (YYYY-MM-DD, ou null si pas de borne) pour un préréglage donné. */
export function calculerPlage(etat) {
  const aujourdhui = new Date().toISOString().slice(0, 10);
  if (etat.preset === "tout") return { debut: null, fin: null };
  if (etat.preset === "annee") return { debut: `${new Date().getFullYear()}-01-01`, fin: aujourdhui };
  if (etat.preset === "3mois" || etat.preset === "6mois" || etat.preset === "12mois") {
    const nbMois = { "3mois": 3, "6mois": 6, "12mois": 12 }[etat.preset];
    const d = new Date();
    d.setMonth(d.getMonth() - nbMois);
    return { debut: d.toISOString().slice(0, 10), fin: aujourdhui };
  }
  // personnalise
  return { debut: etat.debut || null, fin: etat.fin || null };
}

/** Filtre une liste de séances (champ .date, "YYYY-MM-DD") selon la plage calculée. */
export function filtrerParPeriode(seances, etat) {
  const { debut, fin } = calculerPlage(etat);
  if (!debut && !fin) return seances;
  return seances.filter((s) => (!debut || s.date >= debut) && (!fin || s.date <= fin));
}

/**
 * Affiche le sélecteur (select + 2 champs de dates) dans `container` et
 * appelle `onChange()` à chaque modification. `etat` est mutable : {preset,
 * debut, fin} — le composant le met à jour lui-même.
 */
export function renderPeriodeSelector(container, etat, onChange) {
  container.innerHTML = `
    <h3>📅 Période</h3>
    <label>Fenêtre de dates
      <select id="select-periode">
        <option value="tout">Toutes les séances</option>
        <option value="annee">Cette année</option>
        <option value="3mois">3 derniers mois</option>
        <option value="6mois">6 derniers mois</option>
        <option value="12mois">12 derniers mois</option>
        <option value="personnalise">Période personnalisée…</option>
      </select>
    </label>
    <div class="row">
      <label class="grow">Du <input type="date" id="periode-debut" /></label>
      <label class="grow">Au <input type="date" id="periode-fin" /></label>
    </div>
  `;

  const selPreset = container.querySelector("#select-periode");
  const inputDebut = container.querySelector("#periode-debut");
  const inputFin = container.querySelector("#periode-fin");

  function synchroniserAffichage() {
    selPreset.value = etat.preset;
    const { debut, fin } = calculerPlage(etat);
    const editable = etat.preset === "personnalise";
    inputDebut.value = debut || "";
    inputFin.value = fin || "";
    inputDebut.disabled = !editable;
    inputFin.disabled = !editable;
  }

  selPreset.addEventListener("change", (e) => {
    etat.preset = e.target.value;
    if (etat.preset === "personnalise" && !etat.debut && !etat.fin) {
      // pré-remplit la période personnalisée avec la plage "12 derniers mois"
      // pour partir de quelque chose de raisonnable plutôt que de vide.
      const plage12 = calculerPlage({ preset: "12mois" });
      etat.debut = plage12.debut;
      etat.fin = plage12.fin;
    }
    synchroniserAffichage();
    onChange();
  });
  inputDebut.addEventListener("change", (e) => {
    etat.debut = e.target.value || null;
    onChange();
  });
  inputFin.addEventListener("change", (e) => {
    etat.fin = e.target.value || null;
    onChange();
  });

  synchroniserAffichage();
}
