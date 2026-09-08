// ============================================================================
// Écran de consultation — tableau de bord ludique + liste des séances
// ----------------------------------------------------------------------------
// Filtres croisés : cliquer un mois affiche les rivières de ce mois ;
// cliquer une rivière affiche les mois où elle a été navigée. Une fenêtre de
// dates (année en cours, 12 derniers mois, ou plage personnalisée) borne
// l'ensemble du tableau de bord.
// ============================================================================
import * as sessionsApi from "../sessions.js";
import * as usersApi from "../users.js";
import * as charts from "../charts.js";
import * as geo from "../geo.js";

const MOIS_LABELS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"];
const MOIS_LABELS_LONGS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

function riviereOf(s) {
  return s.lieu?.riviere || s.lieu?.nom || "Non renseigné";
}
function moisOf(s) {
  return (s.date || "").slice(0, 7); // "YYYY-MM"
}
function moisLabel(cleMois) {
  const [y, m] = cleMois.split("-").map(Number);
  return `${MOIS_LABELS_LONGS[m - 1]} ${y}`;
}

export function render(container, { onOpenSeance } = {}) {
  const toutes = sessionsApi.listerSeances();
  const adherents = usersApi.listerUtilisateurs();

  const etat = {
    periodePreset: "tout", // tout | annee | 12mois | personnalise
    periodeDebut: "",
    periodeFin: "",
    filtreMois: null,
    filtreRiviere: "",
    filtreParticipant: "",
  };

  container.innerHTML = `
    <div class="card">
      <h3>📅 Période</h3>
      <label>Fenêtre de dates
        <select id="select-periode">
          <option value="tout">Toutes les séances</option>
          <option value="annee">Cette année</option>
          <option value="12mois">12 derniers mois</option>
          <option value="personnalise">Période personnalisée…</option>
        </select>
      </label>
      <div class="row" id="periode-personnalisee" hidden>
        <label class="grow">Du <input type="date" id="periode-debut" /></label>
        <label class="grow">Au <input type="date" id="periode-fin" /></label>
      </div>
    </div>

    <div class="dashboard">
      <div class="stat-cards" id="stat-cards"></div>
      <div class="charts-row">
        <div class="card chart-card">
          <h3>Séances par mois <span class="hint">(cliquer un mois)</span></h3>
          <div id="chart-mois"></div>
        </div>
        <div class="card chart-card">
          <h3>Répartition par rivière <span class="hint">(cliquer une rivière)</span></h3>
          <div id="chart-riviere" class="chart-with-legend"></div>
        </div>
      </div>
      <div class="card chart-card">
        <h3>🗺️ Carte des spots</h3>
        <div id="map-rivieres" class="map-rivieres"></div>
      </div>
    </div>

    <div id="filter-chips" class="filter-chips"></div>

    <div class="card filters">
      <label>Rivière
        <select id="filtre-riviere"><option value="">Toutes</option></select>
      </label>
      <label>Participant
        <select id="filtre-participant"><option value="">Tous</option></select>
      </label>
    </div>

    <div id="liste-seances" class="liste-seances"></div>
  `;

  const rivieres = [...new Set(toutes.map(riviereOf))].sort();
  const selRiviere = container.querySelector("#filtre-riviere");
  rivieres.forEach((r) => selRiviere.insertAdjacentHTML("beforeend", `<option value="${escAttr(r)}">${escHtml(r)}</option>`));

  const selParticipant = container.querySelector("#filtre-participant");
  adherents.forEach((a) =>
    selParticipant.insertAdjacentHTML("beforeend", `<option value="${a.id}">${escHtml(a.prenom)} ${escHtml(a.nom)}</option>`)
  );

  // ---- fenêtre de dates -----------------------------------------------
  function seancesDansPeriode() {
    if (etat.periodePreset === "tout") return toutes;
    let debut = null;
    let fin = null;
    const aujourdhui = new Date().toISOString().slice(0, 10);
    if (etat.periodePreset === "annee") {
      debut = `${new Date().getFullYear()}-01-01`;
      fin = aujourdhui;
    } else if (etat.periodePreset === "12mois") {
      const d = new Date();
      d.setMonth(d.getMonth() - 12);
      debut = d.toISOString().slice(0, 10);
      fin = aujourdhui;
    } else if (etat.periodePreset === "personnalise") {
      debut = etat.periodeDebut || null;
      fin = etat.periodeFin || null;
    }
    return toutes.filter((s) => (!debut || s.date >= debut) && (!fin || s.date <= fin));
  }

  // ---- rendu complet ------------------------------------------------
  function refresh() {
    const base = seancesDansPeriode();
    const pourMois = base.filter((s) => !etat.filtreRiviere || riviereOf(s) === etat.filtreRiviere);
    const pourRiviere = base.filter((s) => !etat.filtreMois || moisOf(s) === etat.filtreMois);
    const complet = base.filter(
      (s) =>
        (!etat.filtreMois || moisOf(s) === etat.filtreMois) &&
        (!etat.filtreRiviere || riviereOf(s) === etat.filtreRiviere) &&
        (!etat.filtreParticipant || (s.participants || []).some((p) => p.id === etat.filtreParticipant))
    );

    renderStatCards(container, complet);
    renderChartMois(container, pourMois, etat, refresh);
    renderChartRiviere(container, pourRiviere, etat, refresh);
    // La carte reste une vue d'ensemble de la période sélectionnée : elle
    // n'est pas réduite par un clic sur un mois/une rivière ailleurs dans le
    // tableau de bord (sinon des bulles "disparaissent" de façon peu claire).
    renderCarte(container, base);
    renderChips(container, etat, refresh);
    renderListe(container, complet, onOpenSeance);

    selRiviere.value = etat.filtreRiviere;
    selParticipant.value = etat.filtreParticipant;
  }

  // ---- écouteurs ------------------------------------------------------
  container.querySelector("#select-periode").addEventListener("change", (e) => {
    etat.periodePreset = e.target.value;
    container.querySelector("#periode-personnalisee").hidden = etat.periodePreset !== "personnalise";
    refresh();
  });
  container.querySelector("#periode-debut").addEventListener("change", (e) => {
    etat.periodeDebut = e.target.value;
    refresh();
  });
  container.querySelector("#periode-fin").addEventListener("change", (e) => {
    etat.periodeFin = e.target.value;
    refresh();
  });
  selRiviere.addEventListener("change", (e) => {
    etat.filtreRiviere = e.target.value;
    refresh();
  });
  selParticipant.addEventListener("change", (e) => {
    etat.filtreParticipant = e.target.value;
    refresh();
  });

  refresh();
}

function renderStatCards(container, seances) {
  const stats = sessionsApi.statistiques(seances);
  container.querySelector("#stat-cards").innerHTML = `
    <div class="stat-card">
      <div class="stat-value">${stats.totalSeances}</div>
      <div class="stat-label">Séances</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${stats.totalParticipants}</div>
      <div class="stat-label">Participations</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${stats.moyenneParticipants}</div>
      <div class="stat-label">Moy. / séance</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${stats.debitMoyen != null ? stats.debitMoyen + " m³/s" : "—"}</div>
      <div class="stat-label">Débit moyen</div>
    </div>
  `;
}

/** Graphique "séances par mois", cliquable pour filtrer sur un mois. */
function renderChartMois(container, seances, etat, refresh) {
  const parMois = {};
  seances.forEach((s) => {
    const m = moisOf(s);
    if (m) parMois[m] = (parMois[m] || 0) + 1;
  });

  // 12 derniers mois glissants par défaut ; si une période plus large que 12
  // mois est sélectionnée, on affiche plutôt tous les mois où il y a eu au
  // moins une séance, pour ne rien perdre.
  const clesConnues = Object.keys(parMois).sort();
  let cles;
  if (etat.periodePreset === "tout" && clesConnues.length > 12) {
    cles = clesConnues;
  } else {
    const now = new Date();
    cles = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      cles.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
  }

  const data = cles.map((cle) => {
    const [, m] = cle.split("-");
    return { label: MOIS_LABELS[Number(m) - 1], key: cle, value: parMois[cle] || 0 };
  });

  const el = container.querySelector("#chart-mois");
  el.innerHTML = "";
  el.appendChild(
    charts.barChart(data, {
      width: 300,
      height: 160,
      selectedKey: etat.filtreMois,
      onClick: (d) => {
        etat.filtreMois = etat.filtreMois === d.key ? null : d.key;
        refresh();
      },
      onReset: () => {
        etat.filtreMois = null;
        refresh();
      },
    })
  );
}

/** Graphique "répartition par rivière", cliquable pour filtrer sur une rivière. */
function renderChartRiviere(container, seances, etat, refresh) {
  const parRiviere = {};
  seances.forEach((s) => {
    const r = riviereOf(s);
    parRiviere[r] = (parRiviere[r] || 0) + 1;
  });
  const data = Object.entries(parRiviere)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([label, value]) => ({ label, value }));

  const onClickRiviere = (d) => {
    etat.filtreRiviere = etat.filtreRiviere === d.label ? "" : d.label;
    refresh();
  };
  const onResetRiviere = () => {
    etat.filtreRiviere = "";
    refresh();
  };

  const el = container.querySelector("#chart-riviere");
  el.innerHTML = "";
  el.appendChild(
    charts.donutChart(data, { size: 140, selectedKey: etat.filtreRiviere || null, onClick: onClickRiviere, onReset: onResetRiviere })
  );
  el.appendChild(charts.legende(data, { selectedKey: etat.filtreRiviere || null, onClick: onClickRiviere }));
}

function renderChips(container, etat, refresh) {
  const el = container.querySelector("#filter-chips");
  const chips = [];
  if (etat.filtreMois) {
    chips.push({ texte: `📅 ${moisLabel(etat.filtreMois)}`, clear: () => (etat.filtreMois = null) });
  }
  if (etat.filtreRiviere) {
    chips.push({ texte: `🌊 ${etat.filtreRiviere}`, clear: () => (etat.filtreRiviere = "") });
  }
  if (etat.filtreParticipant) {
    const nomParticipant = container.querySelector("#filtre-participant").selectedOptions[0]?.textContent || "";
    chips.push({ texte: `👤 ${nomParticipant}`, clear: () => (etat.filtreParticipant = "") });
  }
  if (!chips.length) {
    el.innerHTML = "";
    return;
  }
  el.innerHTML =
    chips.map((c, i) => `<button type="button" class="chip-filtre" data-i="${i}">${escHtml(c.texte)} ✕</button>`).join("") +
    (chips.length > 1 ? `<button type="button" class="chip-filtre chip-filtre-tout" id="chip-tout-reinit">Tout réinitialiser ✕</button>` : "");
  el.querySelectorAll(".chip-filtre[data-i]").forEach((btn) => {
    btn.addEventListener("click", () => {
      chips[Number(btn.dataset.i)].clear();
      refresh();
    });
  });
  el.querySelector("#chip-tout-reinit")?.addEventListener("click", () => {
    chips.forEach((c) => c.clear());
    refresh();
  });
}

// Cache en mémoire (le temps de la session) des géocodages texte -> position,
// pour ne pas re-interroger Nominatim à chaque rafraîchissement du tableau
// de bord pour les mêmes rivières saisies à la main.
const geocodeCache = new Map();

async function geocoderAvecCache(texte) {
  if (geocodeCache.has(texte)) return geocodeCache.get(texte);
  const promesse = geo.geocoderTexte(texte).catch(() => null);
  geocodeCache.set(texte, promesse);
  return promesse;
}

/**
 * Regroupe les séances par spot précis : {nom, riviere, lat, lon, count,
 * approx}. Les séances déjà géolocalisées (GPS) sont utilisées telles
 * quelles ; celles saisies à la main (sans position) sont placées de façon
 * approximative en géocodant le texte rivière/spot — pour que TOUTES les
 * rivières renseignées apparaissent sur la carte, pas seulement celles
 * saisies via « Localiser automatiquement ».
 */
async function agregerParSpot(seances) {
  const groupes = new Map();
  const aGeocoder = [];

  for (const s of seances) {
    const nom = s.lieu?.nom || s.lieu?.riviere;
    if (!nom) continue;
    const pos = s.lieu?.position;
    if (pos && pos.lat != null && pos.lon != null) {
      if (!groupes.has(nom)) groupes.set(nom, { nom, riviere: s.lieu?.riviere || null, lat: pos.lat, lon: pos.lon, count: 0, approx: false });
      groupes.get(nom).count++;
    } else {
      aGeocoder.push({ nom, riviere: s.lieu?.riviere || null, texte: [s.lieu?.riviere, s.lieu?.nom].filter(Boolean).join(", ") });
    }
  }

  // Géocode les spots manquants (un seul appel réseau par texte distinct,
  // grâce au cache), en parallèle.
  const textesUniques = [...new Set(aGeocoder.map((a) => a.texte))];
  await Promise.all(textesUniques.map((t) => geocoderAvecCache(t)));

  for (const a of aGeocoder) {
    const position = await geocoderAvecCache(a.texte);
    if (!position) continue; // introuvable : cette rivière n'apparaîtra pas sur la carte
    if (!groupes.has(a.nom)) groupes.set(a.nom, { nom: a.nom, riviere: a.riviere, lat: position.lat, lon: position.lon, count: 0, approx: true });
    groupes.get(a.nom).count++;
  }

  return ecarterCoordonneesIdentiques([...groupes.values()]);
}

/**
 * Si plusieurs spots partagent exactement les mêmes coordonnées (ex : séances
 * saisies depuis le même endroit avant d'être vraiment sur l'eau, lors de
 * tests), les décale légèrement en cercle autour du point d'origine pour que
 * chaque bulle reste visible et cliquable sur la carte.
 */
function ecarterCoordonneesIdentiques(groupes) {
  const parCoord = new Map();
  groupes.forEach((g) => {
    const cle = `${g.lat.toFixed(5)},${g.lon.toFixed(5)}`;
    if (!parCoord.has(cle)) parCoord.set(cle, []);
    parCoord.get(cle).push(g);
  });
  parCoord.forEach((liste) => {
    if (liste.length < 2) return;
    const rayonDeg = 0.0007; // ~75 m, suffisant pour séparer les bulles au zoom habituel
    liste.forEach((g, i) => {
      const angle = (2 * Math.PI * i) / liste.length;
      const latRad = (g.lat * Math.PI) / 180;
      g.lat += rayonDeg * Math.cos(angle);
      g.lon += (rayonDeg * Math.sin(angle)) / Math.cos(latRad);
    });
  });
  return groupes;
}

let carteInstance = null;
let carteRenderToken = 0;

async function renderCarte(container, seances) {
  const el = container.querySelector("#map-rivieres");
  if (typeof window.L === "undefined") {
    el.innerHTML = `<p class="hint">Carte indisponible (connexion internet requise pour charger la carte).</p>`;
    return;
  }

  // Le géocodage des spots saisis à la main est asynchrone ; si les filtres
  // changent pendant ce temps, on abandonne ce rendu au profit du plus
  // récent plutôt que d'afficher un résultat périmé.
  const monToken = ++carteRenderToken;
  el.innerHTML = `<p class="hint">Chargement de la carte…</p>`;
  const groupes = await agregerParSpot(seances);
  if (monToken !== carteRenderToken) return;

  if (carteInstance) {
    carteInstance.remove();
    carteInstance = null;
  }

  if (!groupes.length) {
    el.innerHTML = `<p class="hint">Aucun spot géolocalisé sur cette période — renseignez au moins la rivière dans une séance pour la faire apparaître ici.</p>`;
    return;
  }

  el.innerHTML = "";
  const map = window.L.map(el, { scrollWheelZoom: true }).setView([groupes[0].lat, groupes[0].lon], 8);
  carteInstance = map;

  window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
    maxZoom: 18,
  }).addTo(map);

  const maxCount = Math.max(...groupes.map((g) => g.count));
  const marqueurs = groupes.map((g) => {
    const taille = Math.round(28 + (g.count / maxCount) * 26); // 28 à 54 px selon le nombre de séances
    const icone = window.L.divIcon({
      className: "spot-bubble-wrap",
      html: `<div class="spot-bubble ${g.approx ? "spot-bubble-approx" : ""}" style="width:${taille}px;height:${taille}px;font-size:${Math.max(11, taille * 0.36)}px">${g.count}</div>`,
      iconSize: [taille, taille],
      iconAnchor: [taille / 2, taille / 2],
    });
    const marqueur = window.L.marker([g.lat, g.lon], { icon: icone }).addTo(map);
    marqueur.bindTooltip(`${g.nom} — ${g.count} séance${g.count > 1 ? "s" : ""}${g.approx ? " (position approximative)" : ""}`, { direction: "top" });
    marqueur.bindPopup(
      `<b>${escHtml(g.nom)}</b>${g.riviere && g.riviere !== g.nom ? `<br><span class="hint">${escHtml(g.riviere)}</span>` : ""}<br>${g.count} séance${g.count > 1 ? "s" : ""}${g.approx ? `<br><span class="hint">📍 position approximative</span>` : ""}`
    );
    return marqueur;
  });

  if (marqueurs.length > 1) {
    map.fitBounds(window.L.featureGroup(marqueurs).getBounds(), { padding: [30, 30] });
  } else {
    map.setView([groupes[0].lat, groupes[0].lon], 11);
  }
}

function renderListe(container, seances, onOpenSeance) {
  const el = container.querySelector("#liste-seances");
  if (!seances.length) {
    el.innerHTML = `<p class="hint" style="padding:16px">Aucune séance ne correspond aux filtres actuels.</p>`;
    return;
  }
  el.innerHTML = seances
    .map((s) => {
      const dateTxt = formatDateFr(s.date);
      const meteo = s.meteo ? `${s.meteo.emoji || "🌡️"} ${s.meteo.temperature != null ? Math.round(s.meteo.temperature) + "°C" : ""}` : "";
      const debit = s.debit?.valeur != null ? `💧 ${s.debit.valeur.toFixed(2)} m³/s` : "";
      const participants = (s.participants || []).map((p) => `${p.prenom} ${p.nom?.[0] || ""}.`).join(", ");
      return `
      <button class="seance-card" data-id="${s.id}">
        <div class="seance-card-top">
          <span class="seance-card-date">${dateTxt}</span>
          <span class="seance-card-meteo">${meteo}</span>
        </div>
        <div class="seance-card-lieu">🌊 ${escHtml(s.lieu?.riviere || "Rivière non renseignée")}${s.lieu?.nom ? ` · ${escHtml(s.lieu.nom)}` : ""}</div>
        <div class="seance-card-meta">
          ${debit ? `<span>${debit}</span>` : ""}
          ${participants ? `<span>👥 ${escHtml(participants)}</span>` : ""}
        </div>
      </button>`;
    })
    .join("");

  el.querySelectorAll(".seance-card").forEach((btn) => {
    btn.addEventListener("click", () => onOpenSeance && onOpenSeance(btn.dataset.id));
  });
}

function formatDateFr(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
function escHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function escAttr(s) {
  return escHtml(s);
}
