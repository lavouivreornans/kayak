// ============================================================================
// Écran Progression — suivi ludique des Pagaies Couleurs FFCK
// ----------------------------------------------------------------------------
// Tronc commun (Blanche, Jaune) puis deux parcours séparés à partir de la
// Verte : Eau vive (Rivière Sportive) et Randonnée (Descente). Les critères
// communs aux deux parcours (badge "commun") se valident une seule fois et
// comptent automatiquement des deux côtés.
// ============================================================================
import * as usersApi from "../users.js";
import * as sessionsApi from "../sessions.js";
import * as progressionApi from "../progression.js";
import * as store from "../store.js";
import * as charts from "../charts.js";
import { classeMax } from "../classes-riviere.js";
import { renderPeriodeSelector, filtrerParPeriode } from "./periode.js";
import { renderCarteSpots } from "./carte-spots.js";
import { toast } from "./toast.js";
import { currentProfile } from "../session-context.js";

let referentiel = null;
let adherentSelectionne = null;
let niveauOuvert = null;
// Période du résumé de pratique — partagée entre les personnes consultées,
// comme sur le tableau de bord club.
const periodePersonne = { preset: "tout", debut: null, fin: null };

export async function render(container, { adherentId = null } = {}) {
  referentiel = await store.loadReferentiel();
  const adherents = usersApi.listerUtilisateurs();
  if (adherentId) {
    adherentSelectionne = adherentId;
    niveauOuvert = null;
  }

  container.innerHTML = `
    <div class="card">
      <label>Adhérent·e
        <select id="select-adherent">
          <option value="">— Choisir —</option>
          ${adherents
            .map((a) => `<option value="${a.id}" ${adherentSelectionne === a.id ? "selected" : ""}>${escHtml(a.prenom)} ${escHtml(a.nom)}</option>`)
            .join("")}
        </select>
      </label>
    </div>
    <div id="progression-content"></div>
  `;

  const select = container.querySelector("#select-adherent");
  select.addEventListener("change", () => {
    adherentSelectionne = select.value || null;
    niveauOuvert = null;
    renderContenu(container);
  });

  if (adherentSelectionne) renderContenu(container);
}

function renderContenu(container) {
  const el = container.querySelector("#progression-content");
  if (!adherentSelectionne) {
    el.innerHTML = "";
    return;
  }
  const progression = progressionApi.calculerProgression(referentiel, adherentSelectionne);

  el.innerHTML = `
    <div class="card" id="periode-personne-holder"></div>
    <div class="card">
      <h3>📊 Résumé de pratique</h3>
      <div class="stat-cards" id="stat-cards-personne"></div>
      <div class="charts-row">
        <div class="chart-card">
          <h3>Rivières pratiquées</h3>
          <div id="chart-riviere-personne" class="chart-with-legend"></div>
        </div>
      </div>
    </div>
    <div class="card chart-card">
      <h3>🗺️ Carte de ses spots</h3>
      <div id="map-personne" class="map-rivieres"></div>
    </div>

    <div class="card">
      <h3>🎓 Tronc commun</h3>
      <p class="hint">Base Kayak (Blanche, Jaune), commune aux deux parcours ci-dessous.</p>
      <div class="niveaux-list">
        ${progression.tronc.detail.map((d) => renderNiveauCard(d)).join("")}
      </div>
    </div>

    ${progression.parcours.map((p) => renderParcours(p)).join("")}
  `;

  renderPeriodeSelector(el.querySelector("#periode-personne-holder"), periodePersonne, () => renderResumePratique(el));
  renderResumePratique(el);

  el.querySelectorAll(".niveau-card-header").forEach((header) => {
    header.addEventListener("click", () => {
      const id = header.dataset.niveau;
      niveauOuvert = niveauOuvert === id ? null : id;
      renderContenu(container);
    });
  });

  el.querySelectorAll(".form-validation-criteres").forEach((form) => {
    form.addEventListener("submit", (e) => onValider(e, container));
    form.querySelector(".btn-valider-niveau")?.addEventListener("click", () => {
      form.querySelectorAll('input[type="checkbox"]:not(:disabled)').forEach((cb) => (cb.checked = true));
    });
    form.querySelectorAll(".btn-valider-theme").forEach((btn) => {
      btn.addEventListener("click", () => {
        btn
          .closest(".capacite-groupe")
          .querySelectorAll('input[type="checkbox"]:not(:disabled)')
          .forEach((cb) => (cb.checked = true));
      });
    });
  });
}

/** Résumé de pratique : sorties, rivières, débit max, classe max + carte — filtré par période. */
function renderResumePratique(el) {
  const toutes = sessionsApi.seancesParParticipant(adherentSelectionne);
  const seances = filtrerParPeriode(toutes, periodePersonne);

  const rivieres = seances.map((s) => s.lieu?.riviere || s.lieu?.nom).filter(Boolean);
  const rivieresUniques = [...new Set(rivieres)];
  const debits = seances.map((s) => s.debit?.valeur).filter((v) => v != null);
  const debitMax = debits.length ? Math.max(...debits) : null;
  const classe = classeMax(seances.map((s) => s.classeRiviere).filter(Boolean));

  el.querySelector("#stat-cards-personne").innerHTML = `
    <div class="stat-card">
      <div class="stat-value">${seances.length}</div>
      <div class="stat-label">Sorties</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${rivieresUniques.length}</div>
      <div class="stat-label">Rivières</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${debitMax != null ? debitMax.toFixed(2) + " m³/s" : "—"}</div>
      <div class="stat-label">Débit max</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${classe || "—"}</div>
      <div class="stat-label">Classe max</div>
    </div>
  `;

  const parRiviere = {};
  rivieres.forEach((r) => (parRiviere[r] = (parRiviere[r] || 0) + 1));
  const data = Object.entries(parRiviere)
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({ label, value }));
  const chartEl = el.querySelector("#chart-riviere-personne");
  chartEl.innerHTML = "";
  if (data.length) {
    chartEl.appendChild(charts.donutChart(data, { size: 140 }));
    chartEl.appendChild(charts.legende(data));
  } else {
    chartEl.innerHTML = `<p class="hint">Aucune séance sur cette période.</p>`;
  }

  renderCarteSpots(el.querySelector("#map-personne"), seances, {
    messageVide: "Aucun spot géolocalisé pour cette personne sur la période sélectionnée.",
  });
}

function renderParcours(p) {
  return `
    <div class="card parcours-header">
      <h2>${p.icone || ""} ${escHtml(p.nom)}</h2>
      ${
        p.niveauActuel
          ? `<div class="badge-pagaie" style="background:${p.niveauActuel.couleur};color:${p.niveauActuel.couleurTexte}">${p.niveauActuel.nom}</div>`
          : `<div class="badge-pagaie badge-pagaie-vide">Aucune pagaie validée sur ce parcours</div>`
      }
      ${
        p.niveauEnCours
          ? `<div class="en-cours-label">🎯 En cours : <b>${p.niveauEnCours.nom}</b> (${p.avancementNiveauEnCours}%)</div>`
          : `<div class="en-cours-label">🏆 Tous les niveaux de ce parcours sont validés !</div>`
      }
    </div>
    <div class="niveaux-list">
      ${p.detail.map((d) => renderNiveauCard(d)).join("")}
    </div>
  `;
}

function renderNiveauCard(d) {
  const { niveau, criteres, pourcentage, complet } = d;
  const ouvert = niveauOuvert === niveau.id;
  return `
    <div class="card niveau-card ${complet ? "niveau-card-complet" : ""}">
      <button type="button" class="niveau-card-header" data-niveau="${niveau.id}">
        <span class="niveau-pastille" style="background:${niveau.couleur};color:${niveau.couleurTexte}">${complet ? "✓" : ""}</span>
        <span class="niveau-card-titre">${niveau.nom}</span>
        <span class="niveau-card-pct">${pourcentage}%</span>
        <span class="niveau-card-chevron">${ouvert ? "▲" : "▼"}</span>
      </button>
      ${charts.barreProgression(pourcentage, { color: niveau.couleur }).outerHTML}
      ${
        ouvert
          ? `
        <div class="niveau-card-detail">
          <p class="hint">${escHtml(niveau.sitePratique || "")}</p>
          <form class="form-validation-criteres" data-niveau="${niveau.id}">
            <button type="button" class="btn btn-outline btn-block btn-valider-niveau">✅ Tout cocher ce niveau</button>
            ${groupByCapacite(criteres)
              .map(
                (grp) => `
              <div class="capacite-groupe">
                <div class="capacite-groupe-header">
                  <h4>${escHtml(grp.capacite)}</h4>
                  <button type="button" class="btn-lien btn-valider-theme">✅ Cocher ce thème</button>
                </div>
                ${grp.items
                  .map(
                    (c) => `
                  <label class="checkbox-row critere-row">
                    <input type="checkbox" name="critere" value="${escAttr(c.cle)}" ${c.valide ? "checked disabled" : ""} />
                    <span>${escHtml(c.critere)}${c.partage ? ' <span class="tag tag-partage">commun aux 2 parcours</span>' : ""}</span>
                  </label>`
                  )
                  .join("")}
              </div>`
              )
              .join("")}
            <button type="submit" class="btn btn-primary btn-block">Enregistrer les critères validés</button>
          </form>
        </div>`
          : ""
      }
    </div>
  `;
}

function groupByCapacite(criteres) {
  const map = new Map();
  for (const c of criteres) {
    if (!map.has(c.capacite)) map.set(c.capacite, []);
    map.get(c.capacite).push(c);
  }
  return [...map.entries()].map(([capacite, items]) => ({ capacite, items }));
}

async function onValider(e, container) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const nouvellesCles = fd.getAll("critere");
  if (!nouvellesCles.length) {
    toast("Cochez au moins un nouveau critère à valider.", "error");
    return;
  }
  try {
    const profile = currentProfile();
    const moniteur = profile ? usersApi.trouverParEmail(profile.email) : null;
    await progressionApi.enregistrerEvaluation(adherentSelectionne, nouvellesCles, {
      moniteurId: moniteur?.id || null,
    });
    toast("Progression enregistrée ✅");
    renderContenu(container);
  } catch (err) {
    toast(`Erreur : ${err.message}`, "error");
  }
}

function escHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function escAttr(s) {
  return escHtml(s);
}
