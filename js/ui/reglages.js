// ============================================================================
// Écran Réglages — compte Google, espace collaboratif, utilisateurs, référentiel
// ============================================================================
import { CONFIG } from "../config.js";
import * as auth from "../auth.js";
import * as store from "../store.js";
import * as usersApi from "../users.js";
import { toast } from "./toast.js";
import { currentProfile, setCurrentProfile } from "../session-context.js";

export async function render(container) {
  const profile = currentProfile();
  const folders = store.getFolders();

  container.innerHTML = `
    <section class="card">
      <h2>👤 Compte Google</h2>
      ${
        profile
          ? `<p>Connecté·e en tant que <b>${escHtml(profile.name || profile.email)}</b> (${escHtml(profile.email)})</p>
             <button id="btn-signout" class="btn btn-outline">Se déconnecter</button>`
          : `<p class="hint">Connectez-vous avec le compte Google utilisé pour le Drive collaboratif du club.</p>
             <button id="btn-signin" class="btn btn-primary">Se connecter avec Google</button>`
      }
    </section>

    <section class="card">
      <h2>☁️ Espace collaboratif (Google Drive)</h2>
      ${
        folders?.root
          ? `<p>Connecté au dossier partagé : <b>${escHtml(folders.rootName || folders.root)}</b></p>
             <p class="hint">Fichiers en attente d'envoi : <span id="pending-count">${store.pendingCount()}</span></p>
             <div class="row">
               <button id="btn-sync" class="btn btn-primary">🔄 Synchroniser maintenant</button>
             </div>`
          : `<p class="hint">Aucun espace collaboratif configuré pour l'instant.</p>
             <p class="hint" style="margin-top:12px">Rejoindre le Drive du club :</p>
             <div class="row">
               <input type="text" id="input-folder-link" placeholder="Lien ou ID du dossier Drive partagé" value="${escAttr(CONFIG.DRIVE_LIEN_CLUB)}" ${profile ? "" : "disabled"} />
               <button id="btn-join-space" class="btn btn-primary" ${profile ? "" : "disabled"}>Rejoindre</button>
             </div>
             <p class="hint" style="margin-top:6px">⚠️ Il faut d'abord que le lien ci-dessus (ou votre adresse Gmail précisément) ait un accès <b>Éditeur</b> sur ce dossier Drive — un accès « lecteur » empêchera l'appli d'y écrire les séances. Vérifiez le partage depuis Google Drive si besoin.</p>
             <p class="hint" style="margin-top:12px">Ou créer un tout nouvel espace (dossier séparé) :</p>
             <div class="row">
               <button id="btn-create-space" class="btn btn-outline" ${profile ? "" : "disabled"}>Créer un nouvel espace</button>
             </div>`
      }
    </section>

    <section class="card">
      <h2>👥 Utilisateurs</h2>
      <div id="liste-utilisateurs"></div>
      <details style="margin-top:12px">
        <summary>➕ Ajouter un moniteur ou un·e adhérent·e</summary>
        <form id="form-utilisateur" class="form-utilisateur">
          <div class="row">
            <label class="grow">Prénom <input type="text" name="prenom" required /></label>
            <label class="grow">Nom <input type="text" name="nom" required /></label>
          </div>
          <label>Email <input type="email" name="email" /></label>
          <label>Rôle
            <select name="role">
              <option value="adherent">Adhérent·e</option>
              <option value="moniteur">Moniteur·rice</option>
            </select>
          </label>
          <button type="submit" class="btn btn-primary">Ajouter</button>
        </form>
      </details>
    </section>

    <section class="card">
      <h2>📘 À propos du référentiel Pagaies Couleurs</h2>
      <p class="hint">
        Le référentiel utilisé (Kayak Blanche/Jaune puis Rivière Sportive Verte/Bleue/Rouge/Noire) est basé sur les
        documents officiels FFCK 2022-2023. Il est partagé avec l'équipe via l'espace collaboratif dès qu'il est configuré.
        Consultez les originaux sur
        <a href="https://www.ffck.org/formation/pagaies-couleurs/referentiels-pagaies-couleurs/" target="_blank" rel="noopener">ffck.org</a>
        en cas de doute.
      </p>
    </section>
  `;

  renderListeUtilisateurs(container);

  container.querySelector("#btn-signin")?.addEventListener("click", async () => {
    try {
      const p = await auth.signIn();
      setCurrentProfile(p);
      toast(`Bienvenue ${p.given_name || p.name} !`);
      await usersApi.assurerProfilPourConnexion(p);
      render(container);
    } catch (e) {
      toast(`Connexion impossible : ${e.message}`, "error");
    }
  });

  container.querySelector("#btn-signout")?.addEventListener("click", () => {
    auth.signOut();
    setCurrentProfile(null);
    render(container);
  });

  container.querySelector("#btn-create-space")?.addEventListener("click", async () => {
    try {
      toast("Création de l'espace collaboratif…");
      await store.createNewCollaborativeSpace();
      await store.syncReferentiel();
      toast("Espace collaboratif créé ✅");
      render(container);
    } catch (e) {
      toast(`Erreur : ${e.message}`, "error");
    }
  });

  container.querySelector("#btn-join-space")?.addEventListener("click", async () => {
    const input = container.querySelector("#input-folder-link").value.trim();
    const folderId = extraireIdDossier(input);
    if (!folderId) {
      toast("Lien ou ID de dossier invalide.", "error");
      return;
    }
    try {
      toast("Connexion à l'espace collaboratif…");
      await store.joinCollaborativeSpace(folderId);
      await store.syncAll();
      await store.syncReferentiel();
      toast("Espace rejoint ✅");
      render(container);
    } catch (e) {
      toast(`Erreur : ${e.message}`, "error");
    }
  });

  container.querySelector("#btn-sync")?.addEventListener("click", async () => {
    const btn = container.querySelector("#btn-sync");
    btn.disabled = true;
    btn.textContent = "Synchronisation…";
    try {
      await store.syncAll();
      toast("Synchronisation terminée ✅");
      render(container);
    } catch (e) {
      toast(`Erreur de synchronisation : ${e.message}`, "error");
    } finally {
      btn.disabled = false;
    }
  });

  container.querySelector("#form-utilisateur")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await usersApi.enregistrerUtilisateur({
        prenom: fd.get("prenom"),
        nom: fd.get("nom"),
        email: fd.get("email"),
        role: fd.get("role"),
        actif: true,
      });
      toast("Utilisateur ajouté ✅");
      e.target.reset();
      render(container);
    } catch (err) {
      toast(`Erreur : ${err.message}`, "error");
    }
  });
}

function renderListeUtilisateurs(container) {
  const el = container.querySelector("#liste-utilisateurs");
  const utilisateurs = usersApi.listerUtilisateurs();
  if (!utilisateurs.length) {
    el.innerHTML = `<p class="hint">Aucun utilisateur pour l'instant.</p>`;
    return;
  }
  el.innerHTML = `<ul class="liste-simple">
    ${utilisateurs
      .map(
        (u) =>
          `<li>${escHtml(u.prenom)} ${escHtml(u.nom)} <span class="tag">${u.role === "moniteur" ? "Moniteur·rice" : "Adhérent·e"}</span>${
            u.pagaieActuelle ? ` <span class="tag tag-pagaie">${escHtml(u.pagaieActuelle)}</span>` : ""
          }</li>`
      )
      .join("")}
  </ul>`;
}

function extraireIdDossier(input) {
  if (!input) return null;
  const m = input.match(/[-\w]{25,}/);
  return m ? m[0] : null;
}

function escHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function escAttr(s) {
  return escHtml(s);
}
