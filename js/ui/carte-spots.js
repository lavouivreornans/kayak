// ============================================================================
// Carte des spots (Leaflet) — réutilisée par le tableau de bord club et par
// le résumé de pratique individuel (écran Progression).
// ----------------------------------------------------------------------------
// - Séances géolocalisées par GPS : position exacte, bulle à bordure pleine.
// - Séances saisies à la main (pas de GPS) : position approximative obtenue
//   en géocodant le texte rivière/spot — bulle à bordure en pointillés pour
//   signaler l'incertitude.
// - Spots aux coordonnées quasi identiques : légèrement écartés pour rester
//   tous visibles.
// - En dézoomant, les bulles proches fusionnent (cluster) et additionnent
//   leurs séances.
// ============================================================================
import * as geo from "../geo.js";

// Cache en mémoire (le temps de la session) des géocodages texte -> position,
// pour ne pas re-interroger Nominatim à chaque rafraîchissement.
const geocodeCache = new Map();

async function geocoderAvecCache(texte) {
  if (geocodeCache.has(texte)) return geocodeCache.get(texte);
  try {
    const position = await geo.geocoderTexte(texte);
    if (position) geocodeCache.set(texte, position); // seuls les succès sont mis en cache
    return position;
  } catch {
    return null; // échec (réseau, limite de débit…) : pas de cache, on réessaiera au prochain rendu
  }
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

/**
 * Affiche la carte des spots dans l'élément `el` (un div vide, avec une
 * hauteur définie en CSS) pour la liste de séances donnée.
 * `messageVide` : texte affiché quand aucun spot n'est géolocalisable.
 */
export async function renderCarteSpots(el, seances, { messageVide } = {}) {
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
    el.innerHTML = `<p class="hint">${messageVide || "Aucun spot géolocalisé pour la sélection actuelle."}</p>`;
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
    // seanceCount est lu par iconCreateFunction ci-dessous pour additionner
    // les séances de plusieurs spots regroupés en un seul cluster.
    const marqueur = window.L.marker([g.lat, g.lon], { icon: icone, seanceCount: g.count });
    marqueur.bindTooltip(`${g.nom} — ${g.count} séance${g.count > 1 ? "s" : ""}${g.approx ? " (position approximative)" : ""}`, { direction: "top" });
    marqueur.bindPopup(
      `<b>${escHtml(g.nom)}</b>${g.riviere && g.riviere !== g.nom ? `<br><span class="hint">${escHtml(g.riviere)}</span>` : ""}<br>${g.count} séance${g.count > 1 ? "s" : ""}${g.approx ? `<br><span class="hint">📍 position approximative</span>` : ""}`
    );
    return marqueur;
  });

  // En dézoomant, les bulles proches fusionnent en une seule qui affiche la
  // somme des séances des spots regroupés (pas juste leur nombre).
  if (window.L.markerClusterGroup) {
    const clusters = window.L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 60,
      iconCreateFunction: (cluster) => {
        const total = cluster.getAllChildMarkers().reduce((somme, m) => somme + (m.options.seanceCount || 0), 0);
        const taille = Math.round(30 + Math.min(total, 20) * 1.3);
        return window.L.divIcon({
          className: "spot-bubble-wrap",
          html: `<div class="spot-bubble spot-bubble-cluster" style="width:${taille}px;height:${taille}px;font-size:${Math.max(12, taille * 0.34)}px">${total}</div>`,
          iconSize: [taille, taille],
        });
      },
    });
    clusters.addLayers(marqueurs);
    map.addLayer(clusters);
  } else {
    marqueurs.forEach((m) => m.addTo(map));
  }

  if (marqueurs.length > 1) {
    map.fitBounds(window.L.featureGroup(marqueurs).getBounds(), { padding: [30, 30] });
  } else {
    map.setView([groupes[0].lat, groupes[0].lon], 11);
  }

  // Filet de sécurité : si le conteneur était masqué/sans dimensions au
  // moment de l'initialisation (onglet pas encore affiché, animation en
  // cours…), Leaflet a calculé une taille de 0 et n'affiche aucune bulle.
  // On force un recalcul une fois le prochain repaint passé.
  requestAnimationFrame(() => map.invalidateSize());
}

function escHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
