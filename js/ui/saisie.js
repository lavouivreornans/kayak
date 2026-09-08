// ============================================================================
// Écran de saisie d'une séance — le plus intuitif possible :
// un bouton "Localiser" pré-remplit rivière, débit et météo automatiquement.
// ============================================================================
import * as geo from "../geo.js";
import * as weather from "../weather.js";
import * as usersApi from "../users.js";
import * as sessionsApi from "../sessions.js";
import { toast } from "./toast.js";

let localisation = null; // dernier résultat de geo.localiserSeance()
let meteo = null;
let editingId = null;

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function nowHHMM() {
  return new Date().toTimeString().slice(0, 5);
}

export function render(container, { seanceId = null } = {}) {
  editingId = seanceId;
  const seance = seanceId ? sessionsApi.obtenirSeance(seanceId) : null;
  if (seance) {
    localisation = {
      position: seance.lieu?.position || null,
      commune: seance.lieu?.commune || null,
      riviere: seance.lieu?.riviere ? { nom: seance.lieu.riviere, distanceKm: seance.lieu.riviereDistanceKm } : null,
      station: seance.stationHydro || null,
      hydro: seance.debit ? { debitM3s: seance.debit.valeur, hauteurCm: seance.debit.hauteurCm, dateMesure: seance.debit.dateMesure } : null,
      erreurs: [],
    };
    meteo = seance.meteo || null;
  } else {
    localisation = null;
    meteo = null;
  }

  const adherents = usersApi.listerUtilisateurs();
  const participantsSelectionnes = new Set((seance?.participants || []).map((p) => p.id));

  container.innerHTML = `
    <form id="form-seance" class="form-saisie" novalidate>
      <section class="card">
        <h2>📍 Lieu &amp; conditions</h2>
        <button type="button" id="btn-localiser" class="btn btn-primary btn-block">
          🎯 Localiser automatiquement
        </button>
        <p id="loc-status" class="hint"></p>
        <div id="loc-result" class="loc-result"></div>

        <label>Rivière <span class="required">*</span>
          <input type="text" name="riviere" value="${escAttr(seance?.lieu?.riviere ?? localisation?.riviere?.nom ?? "")}" placeholder="ex : Ardèche" />
        </label>
        <label>Nom du lieu / spot (optionnel)
          <input type="text" name="lieuNom" value="${escAttr(seance?.lieu?.nom || "")}" placeholder="ex : Base de Chambon, mise à l'eau du pont…" />
        </label>
        <label>Niveau d'eau observé (ressenti)
          <select name="niveauEau">
            ${["", "Très bas", "Bas", "Normal", "Soutenu", "Haut / crue"]
              .map((v) => `<option value="${v}" ${seance?.niveauEau === v ? "selected" : ""}>${v || "—"}</option>`)
              .join("")}
          </select>
        </label>
        <div class="row">
          <label class="grow">Débit réel (m³/s)
            <input type="number" step="0.01" min="0" name="debitValeur" value="${seance?.debit?.valeur ?? localisation?.hydro?.debitM3s ?? ""}" placeholder="auto ou manuel" />
          </label>
          <label class="grow">Hauteur d'eau (cm)
            <input type="number" step="1" name="debitHauteur" value="${seance?.debit?.hauteurCm ?? localisation?.hydro?.hauteurCm ?? ""}" placeholder="auto ou manuel" />
          </label>
        </div>
        <p class="hint">Remplis automatiquement par « Localiser », mais modifiables à la main (station éloignée, valeur relevée sur place…).</p>
      </section>

      <section class="card">
        <h2>🗓️ Date &amp; heure</h2>
        <div class="row">
          <label class="grow">Date <span class="required">*</span>
            <input type="date" name="date" value="${seance?.date || todayISO()}" />
          </label>
          <label>Heure début
            <input type="time" name="heureDebut" value="${seance?.heureDebut || nowHHMM()}" />
          </label>
          <label>Heure fin
            <input type="time" name="heureFin" value="${seance?.heureFin || ""}" />
          </label>
        </div>
      </section>

      <section class="card">
        <h2>👥 Participants <span class="required">*</span></h2>
        <p class="hint">Cochez les moniteurs et adhérents présents sur cette séance (au moins un).</p>
        <div class="participants-list">
          ${
            adherents.length
              ? adherents
                  .map(
                    (a) => `
              <label class="checkbox-row">
                <input type="checkbox" name="participant" value="${a.id}" ${participantsSelectionnes.has(a.id) ? "checked" : ""} />
                <span>${escHtml(a.prenom)} ${escHtml(a.nom)} <em>${a.role === "moniteur" ? "· moniteur" : ""}</em></span>
              </label>`
                  )
                  .join("")
              : `<p class="hint">Aucun utilisateur enregistré pour l'instant — ajoutez-les dans <b>Réglages → Utilisateurs</b>.</p>`
          }
        </div>
      </section>

      <section class="card">
        <h2>📝 Notes</h2>
        <textarea name="notes" rows="4" placeholder="Ambiance, incidents, points travaillés, matériel…">${escHtml(seance?.notes || "")}</textarea>
      </section>

      <p id="form-error" class="form-error" hidden></p>
      <button type="submit" class="btn btn-primary btn-block btn-lg">✅ Enregistrer la séance</button>
    </form>

    ${editingId ? renderBlocEvaluation(seance) : ""}
    ${editingId ? `<button type="button" id="btn-supprimer" class="btn btn-danger btn-block">🗑️ Supprimer cette séance</button>` : ""}
  `;

  container.querySelector("#btn-localiser").addEventListener("click", onLocaliser(container));
  container.querySelector("#form-seance").addEventListener("submit", onSubmit(container));
  container.querySelectorAll(".btn-evaluer").forEach((btn) => {
    btn.addEventListener("click", () => {
      window.dispatchEvent(
        new CustomEvent("edp:navigate", { detail: { tab: "progression", opts: { adherentId: btn.dataset.adherent } } })
      );
    });
  });
  container.querySelector("#btn-supprimer")?.addEventListener("click", () => onSupprimer(container));

  if (localisation) afficherLocalisation(container);
}

async function onSupprimer(container) {
  const seance = editingId ? sessionsApi.obtenirSeance(editingId) : null;
  const libelle = seance ? `du ${seance.date || ""} sur ${seance.lieu?.riviere || seance.lieu?.nom || "cette rivière"}` : "";
  const confirme = window.confirm(`Supprimer définitivement la séance ${libelle} ? Cette action est irréversible.`);
  if (!confirme) return;

  const btn = container.querySelector("#btn-supprimer");
  btn.disabled = true;
  btn.textContent = "Suppression…";
  try {
    await sessionsApi.supprimerSeance(editingId);
    toast("Séance supprimée 🗑️");
    window.dispatchEvent(new CustomEvent("edp:seance-enregistree"));
    window.dispatchEvent(new CustomEvent("edp:navigate", { detail: { tab: "seances", opts: {} } }));
  } catch (err) {
    toast(`Erreur : ${err.message}`, "error");
    btn.disabled = false;
    btn.textContent = "🗑️ Supprimer cette séance";
  }
}

/** Bloc raccourci : évaluer la progression des participants adhérents de cette séance. */
function renderBlocEvaluation(seance) {
  const adherentsSeance = (seance?.participants || []).filter((p) => p.role !== "moniteur");
  if (!adherentsSeance.length) return "";
  return `
    <section class="card">
      <h2>🏅 Valider la progression des participants</h2>
      <p class="hint">Ouvre directement la fiche Pagaies Couleurs de chaque adhérent pour cocher les critères observés lors de cette séance.</p>
      <div class="eval-shortcuts">
        ${adherentsSeance
          .map(
            (p) => `<button type="button" class="btn btn-outline btn-evaluer" data-adherent="${p.id}">🏅 ${escHtml(p.prenom)} ${escHtml(p.nom)}</button>`
          )
          .join("")}
      </div>
    </section>
  `;
}

function onLocaliser(container) {
  return async () => {
    const statusEl = container.querySelector("#loc-status");
    const btn = container.querySelector("#btn-localiser");
    btn.disabled = true;
    statusEl.textContent = "📡 Localisation en cours…";
    try {
      localisation = await geo.localiserSeance();
      statusEl.textContent = "🌦️ Récupération de la météo…";
      try {
        meteo = await weather.meteoActuelle(localisation.position.lat, localisation.position.lon);
      } catch (e) {
        meteo = null;
        localisation.erreurs.push(`Météo : ${e.message}`);
      }
      statusEl.textContent = localisation.erreurs.length
        ? `⚠️ Localisé avec quelques infos manquantes.`
        : `✅ Localisation réussie.`;
      afficherLocalisation(container);

      const riviereInput = container.querySelector('[name="riviere"]');
      if (!riviereInput.value && localisation.riviere) riviereInput.value = localisation.riviere.nom;

      const debitInput = container.querySelector('[name="debitValeur"]');
      if (!debitInput.value && localisation.hydro?.debitM3s != null) debitInput.value = localisation.hydro.debitM3s;
      const hauteurInput = container.querySelector('[name="debitHauteur"]');
      if (!hauteurInput.value && localisation.hydro?.hauteurCm != null) hauteurInput.value = localisation.hydro.hauteurCm;
    } catch (e) {
      statusEl.textContent = `❌ ${e.message}`;
    } finally {
      btn.disabled = false;
    }
  };
}

function afficherLocalisation(container) {
  const el = container.querySelector("#loc-result");
  if (!localisation) {
    el.innerHTML = "";
    return;
  }
  const parts = [];
  if (localisation.commune) parts.push(`<div class="loc-chip">📍 ${escHtml(localisation.commune)}</div>`);
  if (localisation.riviere) {
    parts.push(
      `<div class="loc-chip">🌊 ${escHtml(localisation.riviere.nom)}${
        localisation.riviere.distanceKm != null ? ` (${localisation.riviere.distanceKm} km)` : ""
      }</div>`
    );
  }
  if (localisation.station) {
    const h = localisation.hydro;
    const debitTxt = h?.debitM3s != null ? `${h.debitM3s.toFixed(2)} m³/s` : "débit inconnu";
    const hauteurTxt = h?.hauteurCm != null ? ` · ${h.hauteurCm.toFixed(0)} cm` : "";
    parts.push(
      `<div class="loc-chip">📶 ${escHtml(localisation.station.nom)} (${localisation.station.distanceKm} km) — ${debitTxt}${hauteurTxt}</div>`
    );
  } else if (localisation.station === null) {
    parts.push(`<div class="loc-chip loc-chip-muted">📶 Aucune station hydrométrique connue à proximité — renseignez le débit manuellement si vous le connaissez.</div>`);
  }
  if (meteo) {
    parts.push(
      `<div class="loc-chip">${meteo.emoji} ${meteo.temperatureC != null ? meteo.temperatureC.toFixed(0) + "°C" : ""} · ${escHtml(
        meteo.description
      )} · vent ${meteo.ventKmh != null ? Math.round(meteo.ventKmh) + " km/h" : "?"}</div>`
    );
  }
  if (localisation.erreurs?.length) {
    parts.push(`<div class="loc-chip loc-chip-warn">⚠️ ${localisation.erreurs.map(escHtml).join(" · ")}</div>`);
  }
  el.innerHTML = parts.join("");
}

/** Vérifie les champs obligatoires (rivière, date, ≥1 participant) avant envoi. */
function validerFormulaire(fd, container) {
  const erreurs = [];
  if (!String(fd.get("riviere") || "").trim()) erreurs.push("le nom de la rivière");
  if (!String(fd.get("date") || "").trim()) erreurs.push("la date");
  if (!fd.getAll("participant").length) erreurs.push("au moins un participant");

  const errorEl = container.querySelector("#form-error");
  if (erreurs.length) {
    errorEl.textContent = `⚠️ Merci de renseigner : ${erreurs.join(", ")}.`;
    errorEl.hidden = false;
    errorEl.scrollIntoView({ behavior: "smooth", block: "center" });
    return false;
  }
  errorEl.hidden = true;
  return true;
}

function onSubmit(container) {
  return async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    if (!validerFormulaire(fd, container)) return;

    const participantsIds = fd.getAll("participant");
    const adherents = usersApi.listerUtilisateurs();
    const participants = adherents
      .filter((a) => participantsIds.includes(a.id))
      .map((a) => ({ id: a.id, nom: a.nom, prenom: a.prenom, role: a.role }));

    const debitValeur = fd.get("debitValeur") !== "" ? parseFloat(fd.get("debitValeur")) : null;
    const debitHauteur = fd.get("debitHauteur") !== "" ? parseFloat(fd.get("debitHauteur")) : null;

    const seance = {
      id: editingId || undefined,
      date: fd.get("date"),
      heureDebut: fd.get("heureDebut"),
      heureFin: fd.get("heureFin"),
      niveauEau: fd.get("niveauEau"),
      notes: fd.get("notes"),
      lieu: {
        riviere: String(fd.get("riviere") || "").trim(),
        nom: fd.get("lieuNom"),
        commune: localisation?.commune || null,
        riviereDistanceKm: localisation?.riviere?.distanceKm ?? null,
        position: localisation?.position || null,
      },
      stationHydro: localisation?.station || null,
      debit:
        debitValeur != null || debitHauteur != null
          ? {
              valeur: debitValeur,
              hauteurCm: debitHauteur,
              dateMesure: localisation?.hydro?.dateMesure || null,
            }
          : null,
      meteo: meteo
        ? {
            temperature: meteo.temperatureC,
            ventVitesse: meteo.ventKmh,
            ventDirection: meteo.ventDirectionDeg,
            precipitation: meteo.precipitationMm,
            description: meteo.description,
            emoji: meteo.emoji,
          }
        : null,
      participants,
    };

    const btn = container.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = "Enregistrement…";

    // Rivière tapée à la main sans avoir cliqué sur « Localiser » : on essaie
    // de la placer quand même approximativement sur la carte, à partir du
    // texte saisi (échec silencieux si le service est indisponible ou hors
    // ligne — la séance s'enregistre dans tous les cas).
    if (!seance.lieu.position && seance.lieu.riviere) {
      btn.textContent = "Localisation de la rivière…";
      try {
        const texte = [seance.lieu.riviere, seance.lieu.nom].filter(Boolean).join(", ");
        const position = await geo.geocoderTexte(texte);
        if (position) {
          seance.lieu.position = position;
          seance.lieu.positionApprox = true;
        }
      } catch {
        // pas grave : la séance s'enregistre sans position, la carte l'ignorera
      }
      btn.textContent = "Enregistrement…";
    }

    try {
      await sessionsApi.enregistrerSeance(seance);
      toast("Séance enregistrée ✅");
      e.target.reset();
      editingId = null;
      localisation = null;
      meteo = null;
      render(container);
      window.dispatchEvent(new CustomEvent("edp:seance-enregistree"));
    } catch (err) {
      toast(`Erreur : ${err.message}`, "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "✅ Enregistrer la séance";
    }
  };
}

function escHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function escAttr(s) {
  return escHtml(s);
}
