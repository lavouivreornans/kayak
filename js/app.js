// ============================================================================
// Point d'entrée de l'application
// ============================================================================
import * as auth from "./auth.js";
import * as store from "./store.js";
import { setCurrentProfile, currentProfile } from "./session-context.js";
import * as usersApi from "./users.js";
import { toast } from "./ui/toast.js";
import * as saisieUI from "./ui/saisie.js";
import * as consultationUI from "./ui/consultation.js";
import * as progressionUI from "./ui/progression-ui.js";
import * as reglagesUI from "./ui/reglages.js";

const TABS = {
  saisie: { label: "Saisie", icon: "🛶", render: (el, opts) => saisieUI.render(el, opts) },
  seances: {
    label: "Séances",
    icon: "📊",
    render: (el) => consultationUI.render(el, { onOpenSeance: (id) => goTo("saisie", { seanceId: id }) }),
  },
  progression: { label: "Progression", icon: "🏅", render: (el, opts) => progressionUI.render(el, opts) },
  reglages: { label: "Réglages", icon: "⚙️", render: (el) => reglagesUI.render(el) },
};

const content = document.getElementById("content");
const nav = document.getElementById("bottom-nav");
let activeTab = "saisie";

function buildNav() {
  nav.innerHTML = Object.entries(TABS)
    .map(
      ([key, tab]) =>
        `<button class="nav-btn" data-tab="${key}"><span class="nav-icon">${tab.icon}</span><span>${tab.label}</span></button>`
    )
    .join("");
  nav.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => goTo(btn.dataset.tab));
  });
}

function updateNavHighlight() {
  nav.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.classList.toggle("nav-btn-active", btn.dataset.tab === activeTab);
  });
}

async function goTo(tab, opts = {}) {
  activeTab = tab;
  updateNavHighlight();
  content.innerHTML = `<div class="loading">Chargement…</div>`;
  try {
    await TABS[tab].render(content, opts);
  } catch (e) {
    content.innerHTML = `<div class="card"><p>⚠️ ${e.message}</p></div>`;
  }
}

function updateSyncBadge() {
  const badge = document.getElementById("sync-badge");
  const n = store.pendingCount();
  if (!badge) return;
  if (n > 0) {
    badge.textContent = `${n} en attente d'envoi`;
    badge.hidden = false;
  } else {
    badge.hidden = true;
  }
}

async function syncEnArrierePlan() {
  if (!navigator.onLine || !store.hasRootFolder() || !auth.isSignedIn()) return;
  try {
    await store.syncAll();
  } catch {
    // silencieux — on retentera au prochain cycle
  }
  updateSyncBadge();
}

async function init() {
  buildNav();
  goTo("saisie");

  await auth.initAuth();

  const stored = auth.getStoredProfile();
  if (stored && auth.isSignedIn()) {
    setCurrentProfile(stored);
  } else if (stored) {
    // token expiré : tentative silencieuse
    const p = await auth.signInSilent();
    if (p) setCurrentProfile(p);
  }

  if (currentProfile()) {
    try {
      await usersApi.assurerProfilPourConnexion(currentProfile());
    } catch {
      /* pas grave si l'espace collaboratif n'est pas encore configuré */
    }
  }

  updateSyncBadge();
  syncEnArrierePlan();
  setInterval(syncEnArrierePlan, 5 * 60 * 1000);
  window.addEventListener("online", () => {
    toast("Connexion rétablie, synchronisation…");
    syncEnArrierePlan();
  });
  window.addEventListener("edp:seance-enregistree", updateSyncBadge);
  window.addEventListener("edp:navigate", (e) => goTo(e.detail.tab, e.detail.opts));

  if (!store.hasRootFolder()) {
    toast("Configurez l'espace collaboratif dans Réglages ⚙️", "info", 6000);
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  }
}

init();
