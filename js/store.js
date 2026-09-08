// ============================================================================
// Store local + synchronisation Google Drive
// ----------------------------------------------------------------------------
// Chaque enregistrement (séance, utilisateur…) est un fichier JSON dans un
// sous-dossier Drive. Le cache local (localStorage) permet de lire/écrire
// hors-ligne ; les écritures sont rejouées vers Drive dès que possible.
// ============================================================================
import { CONFIG } from "./config.js";
import * as drive from "./drive.js";

const LS_FOLDERS = "edp_folders";
const LS_CACHE_PREFIX = "edp_cache_";
const LS_PENDING = "edp_pending_writes";
const LS_REFERENTIEL = "edp_cache_referentiel";
const LS_LAST_SYNC_PREFIX = "edp_last_sync_";

const COLLECTIONS = {
  seances: "seances",
  utilisateurs: "utilisateurs",
  evaluations: "evaluations",
};

// ---- petites aides localStorage ------------------------------------------
function readLS(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function writeLS(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

// ---- gestion des dossiers Drive -------------------------------------------
export function getFolders() {
  return readLS(LS_FOLDERS, null);
}

export function setRootFolder(id, name) {
  const folders = getFolders() || {};
  folders.root = id;
  folders.rootName = name;
  writeLS(LS_FOLDERS, folders);
}

export function hasRootFolder() {
  const f = getFolders();
  return !!(f && f.root);
}

/** Crée (si nécessaire) le dossier racine dans le Drive de l'utilisateur courant. */
export async function createNewCollaborativeSpace() {
  const folder = await drive.createFolder(CONFIG.DRIVE_ROOT_FOLDER_NAME, null);
  setRootFolder(folder.id, folder.name);
  await ensureSubfolders();
  return folder;
}

/** Rejoint un espace existant à partir de l'ID de dossier Drive (extrait d'un lien de partage). */
export async function joinCollaborativeSpace(folderId) {
  const info = await drive.getFolderInfo(folderId);
  if (info.mimeType !== "application/vnd.google-apps.folder") {
    throw new Error("Ce lien ne pointe pas vers un dossier Drive.");
  }
  setRootFolder(info.id, info.name);
  await ensureSubfolders();
  return info;
}

async function ensureSubfolders() {
  const folders = getFolders();
  const seances = await drive.findOrCreateFolder("seances", folders.root);
  const utilisateurs = await drive.findOrCreateFolder("utilisateurs", folders.root);
  const evaluations = await drive.findOrCreateFolder("evaluations", folders.root);
  folders.seances = seances.id;
  folders.utilisateurs = utilisateurs.id;
  folders.evaluations = evaluations.id;
  writeLS(LS_FOLDERS, folders);
  return folders;
}

// ---- file d'attente hors-ligne --------------------------------------------
function getPending() {
  return readLS(LS_PENDING, []);
}
function setPending(list) {
  writeLS(LS_PENDING, list);
}
export function pendingCount() {
  return getPending().length;
}

// ---- cache générique par collection ---------------------------------------
function cacheKey(collection) {
  return `${LS_CACHE_PREFIX}${collection}`;
}
function readCache(collection) {
  return readLS(cacheKey(collection), {});
}
function writeCache(collection, obj) {
  writeLS(cacheKey(collection), obj);
}

export function getAllRecords(collection) {
  const cache = readCache(collection);
  return Object.values(cache)
    .filter((r) => !r._deleted)
    .map((r) => stripMeta(r));
}

export function getRecord(collection, id) {
  const cache = readCache(collection);
  const r = cache[id];
  return r && !r._deleted ? stripMeta(r) : null;
}

function stripMeta(record) {
  const { _driveFileId, _modifiedTime, _deleted, ...rest } = record;
  return { ...rest, _driveFileId };
}

/** Enregistre localement (optimiste) puis tente l'écriture Drive. */
export async function saveRecord(collection, id, data) {
  const cache = readCache(collection);
  const existing = cache[id] || {};
  const merged = { ...existing, ...data, id, _modifiedTime: new Date().toISOString() };
  cache[id] = merged;
  writeCache(collection, cache);

  try {
    await pushRecordToDrive(collection, id);
    unqueuePending(collection, id);
  } catch (e) {
    queuePending(collection, id, "write");
  }
  return stripMeta(merged);
}

/** Supprime un enregistrement (localement tout de suite, puis sur Drive). */
export async function deleteRecord(collection, id) {
  const cache = readCache(collection);
  const record = cache[id];
  if (!record) return;
  record._deleted = true;
  record._modifiedTime = new Date().toISOString();
  writeCache(collection, cache);

  try {
    if (record._driveFileId) await drive.deleteFile(record._driveFileId);
    unqueuePending(collection, id);
  } catch {
    queuePending(collection, id, "delete");
  }
}

function unqueuePending(collection, id) {
  const pending = getPending();
  const filtered = pending.filter((p) => !(p.collection === collection && p.id === id));
  if (filtered.length !== pending.length) setPending(filtered);
}

function queuePending(collection, id, action) {
  const pending = getPending();
  const existing = pending.find((p) => p.collection === collection && p.id === id);
  if (existing) {
    existing.action = action; // une suppression après une écriture en attente remplace l'action
  } else {
    pending.push({ collection, id, action });
  }
  setPending(pending);
}

async function pushRecordToDrive(collection, id) {
  const folders = getFolders();
  if (!folders || !folders[collection]) throw new Error("Espace collaboratif non configuré");
  const cache = readCache(collection);
  const record = cache[id];
  if (!record) return;
  const { _driveFileId, _modifiedTime, _deleted, ...payload } = record;
  const result = await drive.writeJsonFile({
    fileId: _driveFileId || null,
    folderId: folders[collection],
    name: `${id}.json`,
    data: payload,
  });
  cache[id]._driveFileId = result.id;
  writeCache(collection, cache);
}

async function deleteRecordFromDrive(collection, id) {
  const cache = readCache(collection);
  const record = cache[id];
  if (!record || !record._driveFileId) return;
  await drive.deleteFile(record._driveFileId);
}

/** Rejoue les écritures/suppressions en attente (à appeler périodiquement ou à la reconnexion). */
export async function flushPendingWrites() {
  const pending = getPending();
  if (!pending.length) return { flushed: 0, remaining: 0 };
  const stillPending = [];
  let flushed = 0;
  for (const item of pending) {
    try {
      if (item.action === "delete") {
        await deleteRecordFromDrive(item.collection, item.id);
      } else {
        await pushRecordToDrive(item.collection, item.id);
      }
      flushed++;
    } catch {
      stillPending.push(item);
    }
  }
  setPending(stillPending);
  return { flushed, remaining: stillPending.length };
}

/**
 * Synchronise une collection depuis Drive : télécharge les fichiers nouveaux
 * ou modifiés depuis la dernière synchro. C'est ainsi que les séances/profils
 * créés par d'autres moniteurs apparaissent dans l'appli.
 */
export async function syncCollection(collection) {
  const folders = getFolders();
  if (!folders || !folders[collection]) return { updated: 0 };
  const files = await drive.listJsonFiles(folders[collection]);
  const idsPresents = new Set(files.map((f) => f.id));
  const cache = readCache(collection);
  const pending = getPending();
  let updated = 0;

  // Un fichier connu localement mais absent du dossier Drive a été supprimé
  // par quelqu'un d'autre : on aligne le cache local (sauf si on a
  // nous-mêmes une écriture en attente dessus, auquel cas on la laisse
  // filer normalement plutôt que d'écraser un ajout hors-ligne).
  for (const [id, record] of Object.entries(cache)) {
    const enAttente = pending.some((p) => p.collection === collection && p.id === id);
    if (record._driveFileId && !idsPresents.has(record._driveFileId) && !record._deleted && !enAttente) {
      record._deleted = true;
      updated++;
    }
  }

  for (const file of files) {
    const id = file.name.replace(/\.json$/, "");
    const local = cache[id];
    if (!local || local._modifiedTime !== file.modifiedTime) {
      try {
        const data = await drive.readJsonFile(file.id);
        cache[id] = { ...data, id, _driveFileId: file.id, _modifiedTime: file.modifiedTime };
        updated++;
      } catch {
        // on ignore ce fichier pour cette passe, on réessaiera à la prochaine synchro
      }
    }
  }
  writeCache(collection, cache);
  writeLS(`${LS_LAST_SYNC_PREFIX}${collection}`, new Date().toISOString());
  return { updated };
}

export async function syncAll() {
  const results = {};
  for (const c of Object.values(COLLECTIONS)) {
    results[c] = await syncCollection(c);
  }
  await flushPendingWrites();
  return results;
}

export function lastSyncAt(collection) {
  return readLS(`${LS_LAST_SYNC_PREFIX}${collection}`, null);
}

// ---- référentiel pagaies couleurs (fichier unique, pas une collection) ----
export function getLocalReferentiel() {
  return readLS(LS_REFERENTIEL, null);
}

export function setLocalReferentiel(data) {
  writeLS(LS_REFERENTIEL, data);
}

export async function loadReferentiel({ forceDefault = false } = {}) {
  const cached = getLocalReferentiel();
  // On tente toujours de récupérer la version fournie avec l'appli (rapide,
  // même origine) pour détecter une mise à jour du référentiel (numéro
  // "_version" différent) — sinon on retombe sur le cache local, puis sur
  // rien si totalement hors-ligne au tout premier lancement.
  try {
    const res = await fetch("./data/pagaies-couleur.json");
    const bundled = await res.json();
    if (forceDefault || !cached || cached._version !== bundled._version) {
      setLocalReferentiel(bundled);
      return bundled;
    }
    return cached;
  } catch {
    if (cached) return cached;
    throw new Error("Référentiel Pagaies Couleurs indisponible (hors-ligne au premier lancement).");
  }
}

export async function syncReferentiel() {
  const folders = getFolders();
  if (!folders || !folders.root) return null;
  const existing = await drive.findChild("referentiel-pagaies-couleurs.json", folders.root);
  if (existing) {
    const data = await drive.readJsonFile(existing.id);
    setLocalReferentiel(data);
    writeLS(`${LS_REFERENTIEL}_fileId`, existing.id);
    return data;
  }
  // n'existe pas encore côté Drive : on y publie la version locale/par défaut
  const local = await loadReferentiel();
  const result = await drive.writeJsonFile({
    fileId: null,
    folderId: folders.root,
    name: "referentiel-pagaies-couleurs.json",
    data: local,
  });
  writeLS(`${LS_REFERENTIEL}_fileId`, result.id);
  return local;
}

export async function saveReferentiel(data) {
  setLocalReferentiel(data);
  const folders = getFolders();
  if (!folders || !folders.root) return;
  const fileId = readLS(`${LS_REFERENTIEL}_fileId`, null);
  const result = await drive.writeJsonFile({
    fileId,
    folderId: folders.root,
    name: "referentiel-pagaies-couleurs.json",
    data,
  });
  writeLS(`${LS_REFERENTIEL}_fileId`, result.id);
}

export { COLLECTIONS };
