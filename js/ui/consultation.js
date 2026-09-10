// ============================================================================
// Écran de consultation — tableau de bord ludique + liste des séances
// ----------------------------------------------------------------------------
// Filtres croisés : cliquer un mois affiche les rivières de ce mois ;
// cliquer une rivière affiche les mois où elle a été navigée. Une fenêtre de
// dates (année en cours, 12 derniers mois, ou plage personnalisée) borne
// l'ensemble du tableau de bord — les dates réellement appliquées sont
// toujours affichées, quel que soit le préréglage choisi.
// ============================================================================
import * as sessionsApi from "../sessions.js";
import * as usersApi from "../users.js";
import * as charts from "../charts.js";
import { renderPeriodeSelector, filtrerParPeriode } from "./periode.js";
import { renderCarteSpots } from "./carte-spots.js";

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

  const periode = { preset: "tout", debut: null, fin: null };
  const etat = {
    filtreMois: null,
    filtreRiviere: "",
    filtreParticipant: "",
  };

  container.innerHTML = `
    <div class="card" id="periode-holder"></div>

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

  renderPeriodeSelector(container.querySelector("#periode-holder"), periode, refresh);

  // ---- rendu complet ------------------------------------------------
  function refresh() {
    const base = filtrerParPeriode(toutes, periode);
    const pourMois = base.filter((s) => !etat.filtreRiviere || riviereOf(s) === etat.filtreRiviere);
    const pourRiviere = base.filter((s) => !etat.filtreMois || moisOf(s) === etat.filtreMois);
    const complet = base.filter(
      (s) =>
        (!etat.filtreMois || moisOf(s) === etat.filtreMois) &&
        (!etat.filtreRiviere || riviereOf(s) === etat.filtreRiviere) &&
        (!etat.filtreParticipant || (s.participants || []).some((p) => p.id === etat.filtreParticipant))
    );

    renderStatCards(container, complet);
    renderChartMois(container, pourMois, periode, etat, refresh);
    renderChartRiviere(container, pourRiviere, etat, refresh);
    // La carte suit les mêmes filtres (période + mois + rivière + participant)
    // que le reste du tableau de bord.
    renderCarteSpots(container.querySelector("#map-rivieres"), complet, {
      messageVide: "Aucun spot géolocalisé pour la sélection actuelle — renseignez au moins la rivière dans une séance pour la faire apparaître ici.",
    });
    renderChips(container, etat, refresh);
    renderListe(container, complet, onOpenSeance);

    selRiviere.value = etat.filtreRiviere;
    selParticipant.value = etat.filtreParticipant;
  }

  // ---- écouteurs ------------------------------------------------------
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
function renderChartMois(container, seances, periode, etat, refresh) {
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
  if (periode.preset === "tout" && clesConnues.length > 12) {
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
      const classe = s.classeRiviere ? `🏷️ ${s.classeRiviere}` : "";
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
          ${classe ? `<span>${classe}</span>` : ""}
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
