// ============================================================================
// Météo locale (Open-Meteo — gratuit, sans clé d'API)
// ============================================================================

// Table de correspondance des codes météo Open-Meteo (WMO) -> libellé + emoji.
const WMO_CODES = {
  0: ["Ciel dégagé", "☀️"],
  1: ["Plutôt dégagé", "🌤️"],
  2: ["Partiellement nuageux", "⛅"],
  3: ["Couvert", "☁️"],
  45: ["Brouillard", "🌫️"],
  48: ["Brouillard givrant", "🌫️"],
  51: ["Bruine légère", "🌦️"],
  53: ["Bruine modérée", "🌦️"],
  55: ["Bruine dense", "🌦️"],
  61: ["Pluie légère", "🌧️"],
  63: ["Pluie modérée", "🌧️"],
  65: ["Pluie forte", "🌧️"],
  66: ["Pluie verglaçante", "🌧️"],
  67: ["Pluie verglaçante forte", "🌧️"],
  71: ["Neige légère", "🌨️"],
  73: ["Neige modérée", "🌨️"],
  75: ["Neige forte", "🌨️"],
  80: ["Averses légères", "🌦️"],
  81: ["Averses modérées", "🌦️"],
  82: ["Averses violentes", "⛈️"],
  95: ["Orage", "⛈️"],
  96: ["Orage avec grêle", "⛈️"],
  99: ["Orage violent avec grêle", "⛈️"],
};

export function libelleMeteo(code) {
  return WMO_CODES[code] ? WMO_CODES[code][0] : "Conditions inconnues";
}
export function emojiMeteo(code) {
  return WMO_CODES[code] ? WMO_CODES[code][1] : "🌡️";
}

/** Météo actuelle (Open-Meteo) pour une position donnée. */
export async function meteoActuelle(lat, lon) {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,precipitation,weather_code,wind_speed_10m,wind_direction_10m,relative_humidity_2m` +
    `&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Service météo indisponible");
  const data = await res.json();
  const c = data.current || {};
  return {
    temperatureC: c.temperature_2m ?? null,
    precipitationMm: c.precipitation ?? null,
    ventKmh: c.wind_speed_10m ?? null,
    ventDirectionDeg: c.wind_direction_10m ?? null,
    humidite: c.relative_humidity_2m ?? null,
    codeMeteo: c.weather_code ?? null,
    description: libelleMeteo(c.weather_code),
    emoji: emojiMeteo(c.weather_code),
    heureMesure: c.time || null,
  };
}

export function directionVentTexte(deg) {
  if (deg == null) return "";
  const dirs = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
  return dirs[Math.round(deg / 45) % 8];
}
