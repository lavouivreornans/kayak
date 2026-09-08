// ============================================================================
// Accès Google Drive (API v3) — dossier collaboratif partagé entre moniteurs
// ============================================================================
import { getAccessToken, signInSilent } from "./auth.js";

const API_BASE = "https://www.googleapis.com/drive/v3";
const UPLOAD_BASE = "https://www.googleapis.com/upload/drive/v3";
const FOLDER_MIME = "application/vnd.google-apps.folder";

class DriveError extends Error {}

async function authHeaders() {
  let token = getAccessToken();
  if (!token) {
    // tente un renouvellement silencieux avant d'abandonner
    const profile = await signInSilent();
    token = getAccessToken();
    if (!token) throw new DriveError("Non connecté à Google Drive");
  }
  return { Authorization: `Bearer ${token}` };
}

async function driveFetch(url, options = {}) {
  const headers = { ...(options.headers || {}), ...(await authHeaders()) };
  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new DriveError(`Erreur Drive (${res.status}) : ${body.slice(0, 200)}`);
  }
  return res;
}

/** Recherche un fichier/dossier par nom sous un parent donné. Retourne l'id ou null. */
export async function findChild(name, parentId, { onlyFolder = false } = {}) {
  const q = [
    `name = '${name.replace(/'/g, "\\'")}'`,
    `'${parentId}' in parents`,
    "trashed = false",
    onlyFolder ? `mimeType = '${FOLDER_MIME}'` : null,
  ]
    .filter(Boolean)
    .join(" and ");
  const url = `${API_BASE}/files?q=${encodeURIComponent(q)}&fields=files(id,name)&spaces=drive`;
  const res = await driveFetch(url);
  const data = await res.json();
  return data.files && data.files.length ? data.files[0] : null;
}

export async function createFolder(name, parentId) {
  const res = await driveFetch(`${API_BASE}/files?fields=id,name`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      mimeType: FOLDER_MIME,
      parents: parentId ? [parentId] : undefined,
    }),
  });
  return res.json();
}

export async function findOrCreateFolder(name, parentId) {
  const existing = await findChild(name, parentId, { onlyFolder: true });
  if (existing) return existing;
  return createFolder(name, parentId);
}

/** Liste tous les fichiers .json (non supprimés) d'un dossier, avec pagination. */
export async function listJsonFiles(folderId) {
  let files = [];
  let pageToken = "";
  do {
    const q = `'${folderId}' in parents and trashed = false and name contains '.json'`;
    const url = `${API_BASE}/files?q=${encodeURIComponent(q)}&fields=nextPageToken,files(id,name,modifiedTime)&pageSize=1000&spaces=drive${
      pageToken ? `&pageToken=${pageToken}` : ""
    }`;
    const res = await driveFetch(url);
    const data = await res.json();
    files = files.concat(data.files || []);
    pageToken = data.nextPageToken || "";
  } while (pageToken);
  return files;
}

export async function readJsonFile(fileId) {
  const res = await driveFetch(`${API_BASE}/files/${fileId}?alt=media`);
  return res.json();
}

/** Crée ou met à jour (si fileId fourni) un fichier JSON dans un dossier. */
export async function writeJsonFile({ fileId, folderId, name, data }) {
  const metadata = fileId ? {} : { name, parents: [folderId], mimeType: "application/json" };
  const boundary = "edpkayak" + Math.random().toString(36).slice(2);
  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(data)}\r\n` +
    `--${boundary}--`;

  const url = fileId
    ? `${UPLOAD_BASE}/files/${fileId}?uploadType=multipart&fields=id`
    : `${UPLOAD_BASE}/files?uploadType=multipart&fields=id`;

  const res = await driveFetch(url, {
    method: fileId ? "PATCH" : "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  return res.json();
}

export async function deleteFile(fileId) {
  await driveFetch(`${API_BASE}/files/${fileId}`, { method: "DELETE" });
}

/** Retourne les infos (nom, propriétaire) d'un dossier à partir de son id — utile pour rejoindre un dossier partagé. */
export async function getFolderInfo(folderId) {
  const res = await driveFetch(
    `${API_BASE}/files/${folderId}?fields=id,name,mimeType,owners(displayName,emailAddress)`
  );
  return res.json();
}

export { DriveError };
