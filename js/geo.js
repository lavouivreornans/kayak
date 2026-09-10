// ============================================================================
// Géolocalisation, cours d'eau le plus proche (Overpass/OSM) et station
// hydrométrique Hub'Eau la plus proche (débit rivière).
// ============================================================================
import { CONFIG } from "./config.js";

// Les services externes (Nominatim, Overpass, Hub'Eau) peuvent ne jamais
// répondre en cas de signal faible sur le terrain — sans timeout, un fetch()
// qui ne résout ni ne rejette jamais bloquerait indéfiniment le bouton
// « Enregistrer » (l'appli attend la localisation avant de sauvegarder).
async function fetchAvecTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const minuteur = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (e) {
    if (e.name === "AbortError") throw new Error("Le service ne répond pas (signal faible ?)");
    throw e;
  } finally {
    clearTimeout(minuteur);
  }
}

export function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("La géolocalisation n'est pas disponible sur cet appareil."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude, precision: pos.coords.accuracy }),
      (err) => reject(new Error(`Géolocalisation refusée ou indisponible : ${err.message}`)),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  });
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Nom de la commune la plus proche via Nominatim (reverse geocoding, OpenStreetMap). */
export async function reverseGeocodeCommune(lat, lon) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=14&accept-language=fr`;
  const res = await fetchAvecTimeout(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error("Service de géocodage indisponible");
  const data = await res.json();
  const a = data.address || {};
  return a.village || a.town || a.city || a.municipality || a.county || data.display_name || null;
}

/**
 * Position approximative à partir d'un texte libre (ex : "Ardèche, Pont d'Arc")
 * via Nominatim (geocodage direct). Utile pour placer sur la carte les
 * séances saisies sans géolocalisation GPS. Retourne null si rien trouvé.
 */
export async function geocoderTexte(texte) {
  const q = String(texte || "").trim();
  if (!q) return null;
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=fr&accept-language=fr&q=${encodeURIComponent(
    q
  )}`;
  const res = await fetchAvecTimeout(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error("Service de géocodage indisponible");
  const data = await res.json();
  if (!data.length) return null;
  return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
}

/** Cherche le cours d'eau (waterway) le plus proche via l'API Overpass (OpenStreetMap). */
export async function trouverRiviereProche(lat, lon, rayonKm = CONFIG.RAYON_RIVIERE_KM) {
  const rayonM = Math.round(rayonKm * 1000);
  const query = `[out:json][timeout:15];
    (
      way["waterway"~"river|stream"](around:${rayonM},${lat},${lon});
    );
    out tags center 20;`;
  const res = await fetchAvecTimeout("https://overpass-api.de/api/interpreter", {
    method: "POST",
    body: query,
  });
  if (!res.ok) throw new Error("Service Overpass indisponible");
  const data = await res.json();
  const named = (data.elements || []).filter((el) => el.tags && el.tags.name);
  if (!named.length) return null;
  // choisit le plus proche du point s'il fournit un centre, sinon le premier trouvé
  named.sort((a, b) => {
    const da = a.center ? haversineKm(lat, lon, a.center.lat, a.center.lon) : Infinity;
    const db = b.center ? haversineKm(lat, lon, b.center.lat, b.center.lon) : Infinity;
    return da - db;
  });
  const best = named[0];
  return {
    nom: best.tags.name,
    distanceKm: best.center ? Math.round(haversineKm(lat, lon, best.center.lat, best.center.lon) * 10) / 10 : null,
  };
}

/**
 * Cherche la station hydrométrique Hub'Eau la plus proche (données publiques
 * françaises) puis récupère le dernier débit (Q, en m³/s) et hauteur d'eau
 * (H, en cm) connus.
 */
export async function trouverStationHydroProche(lat, lon, rayonKm = CONFIG.RAYON_STATION_HYDRO_KM) {
  const deltaLat = rayonKm / 111;
  const deltaLon = rayonKm / (111 * Math.cos((lat * Math.PI) / 180));
  const bbox = [lon - deltaLon, lat - deltaLat, lon + deltaLon, lat + deltaLat].join(",");
  const url = `https://hubeau.eaufrance.fr/api/v2/hydrometrie/referentiel/stations?bbox=${bbox}&en_service=true&size=50`;
  const res = await fetchAvecTimeout(url);
  if (!res.ok) throw new Error("Service Hub'Eau (stations) indisponible");
  const data = await res.json();
  const stations = (data.data || []).filter((s) => s.latitude_station && s.longitude_station);
  if (!stations.length) return null;
  stations.forEach((s) => {
    s._distanceKm = haversineKm(lat, lon, s.latitude_station, s.longitude_station);
  });
  stations.sort((a, b) => a._distanceKm - b._distanceKm);
  const station = stations[0];
  return {
    code: station.code_station,
    nom: station.libelle_station,
    coursEau: station.libelle_cours_eau || null,
    distanceKm: Math.round(station._distanceKm * 10) / 10,
  };
}

/** Dernière observation de débit (Q) et hauteur (H) pour une station donnée. */
export async function derniereObservationHydro(codeStation) {
  const url = `https://hubeau.eaufrance.fr/api/v2/hydrometrie/observations_tr?code_entite=${codeStation}&size=20&sort=desc`;
  const res = await fetchAvecTimeout(url);
  if (!res.ok) throw new Error("Service Hub'Eau (observations) indisponible");
  const data = await res.json();
  const obs = data.data || [];
  const debit = obs.find((o) => o.grandeur_hydro === "Q");
  const hauteur = obs.find((o) => o.grandeur_hydro === "H");
  return {
    debitM3s: debit ? debit.resultat_obs / 1000 : null, // Hub'Eau renvoie Q en L/s
    hauteurCm: hauteur ? hauteur.resultat_obs / 10 : null, // Hub'Eau renvoie H en mm
    dateMesure: (debit || hauteur || {}).date_obs || null,
  };
}

/** Enchaîne géolocalisation + rivière + station hydro + débit, avec gestion d'échecs partiels. */
export async function localiserSeance() {
  const pos = await getPosition();
  const resultat = { position: pos, commune: null, riviere: null, station: null, hydro: null, erreurs: [] };

  const tasks = [
    reverseGeocodeCommune(pos.lat, pos.lon)
      .then((c) => (resultat.commune = c))
      .catch((e) => resultat.erreurs.push(`Commune : ${e.message}`)),
    trouverRiviereProche(pos.lat, pos.lon)
      .then((r) => (resultat.riviere = r))
      .catch((e) => resultat.erreurs.push(`Cours d'eau : ${e.message}`)),
    trouverStationHydroProche(pos.lat, pos.lon)
      .then(async (s) => {
        resultat.station = s;
        if (s) {
          try {
            resultat.hydro = await derniereObservationHydro(s.code);
          } catch (e) {
            resultat.erreurs.push(`Débit : ${e.message}`);
          }
        }
      })
      .catch((e) => resultat.erreurs.push(`Station hydro : ${e.message}`)),
  ];
  await Promise.all(tasks);
  return resultat;
}
