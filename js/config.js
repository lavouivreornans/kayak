// ============================================================================
// Configuration de l'application — Séances Kayak EDP
// ============================================================================
// À COMPLÉTER avant la première utilisation : voir README.md, section
// "Mise en route" pour obtenir un Client ID Google.
// ============================================================================

export const CONFIG = {
  // Client ID OAuth2 obtenu sur https://console.cloud.google.com
  // (Identifiants > Créer des identifiants > ID client OAuth > Application Web)
  GOOGLE_CLIENT_ID: "REMPLACER_PAR_VOTRE_CLIENT_ID.apps.googleusercontent.com",

  // Scope Drive complet : nécessaire pour lire/écrire les fichiers créés par
  // les AUTRES moniteurs dans le dossier partagé (le scope restreint
  // "drive.file" ne le permettrait pas). Voir README.md "Pourquoi ce scope ?".
  GOOGLE_SCOPES: "https://www.googleapis.com/auth/drive",

  // Nom du dossier racine créé/recherché dans le Google Drive de la personne
  // qui initialise l'espace collaboratif. Les autres moniteurs rejoignent cet
  // espace en ouvrant le lien de partage puis en le sélectionnant au premier
  // lancement (voir écran Réglages > Espace collaboratif).
  DRIVE_ROOT_FOLDER_NAME: "EDP-Kayak",

  // Nom du club affiché dans l'appli (modifiable dans Réglages).
  NOM_CLUB_DEFAUT: "Mon club de kayak",

  // Rayon de recherche (km) pour la station hydrométrique Hub'Eau la plus proche.
  RAYON_STATION_HYDRO_KM: 30,

  // Rayon de recherche (km) pour identifier le cours d'eau le plus proche
  // (via l'API Overpass / OpenStreetMap).
  RAYON_RIVIERE_KM: 3,

  // Lien pré-rempli dans Réglages > Rejoindre un espace, pour que les
  // moniteurs du club n'aient qu'à cliquer sur "Rejoindre" au premier
  // lancement. À changer si le dossier partagé du club change.
  DRIVE_LIEN_CLUB: "https://drive.google.com/drive/folders/10Szgch5sbUSOYfUonsPPOpVFSozS6RZK?usp=sharing",
};
