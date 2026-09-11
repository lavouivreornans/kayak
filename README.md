# Séances Kayak 🛶

Carnet de séances collaboratif pour club de kayak, à l'usage des moniteurs
(puis des adhérents pour suivre leur progression).

- **Saisie ultra-rapide** : un bouton « Localiser automatiquement » remplit la
  rivière la plus proche (OpenStreetMap), la station hydrométrique et le
  débit du moment (Hub'Eau, données publiques françaises), et la météo locale
  (Open-Meteo).
- **Consultation ludique** : tableau de bord avec statistiques, graphiques,
  liste filtrable des séances.
- **Collaboratif** : toutes les séances saisies par un moniteur sont visibles
  par les autres, via un dossier **Google Drive partagé**.
- **Progression** : suivi individuel des adhérents selon le référentiel
  officiel **Pagaies Couleurs FFCK** (Kayak Blanche/Jaune puis Rivière
  Sportive Verte/Bleue/Rouge/Noire).

C'est une **Progressive Web App (PWA)** : une appli web installable, qui
fonctionne hors-ligne et peut être empaquetée en **fichier APK** pour Android.

---

## 1. Mise en route (à faire une seule fois)

### 1.1 Créer les identifiants Google (obligatoire)

L'appli a besoin d'un « Client ID » Google pour se connecter au Drive
collaboratif.

1. Allez sur [console.cloud.google.com](https://console.cloud.google.com/) et
   connectez-vous avec le compte Google qui hébergera le dossier partagé du
   club (ou n'importe quel compte — peu importe, du moment que tous les
   moniteurs y ont accès ensuite).
2. Créez un nouveau projet (menu du haut → *Nouveau projet* → nommez-le par
   exemple `Kayak Club`).
3. Dans le menu de gauche : **APIs et services → Bibliothèque**, cherchez
   **Google Drive API** et cliquez sur **Activer**.
4. **APIs et services → Écran de consentement OAuth** :
   - Type d'utilisateur : **Externe**.
   - Renseignez un nom d'appli (ex. « Séances Kayak »), un email de contact.
   - Étape *Scopes* : vous pouvez passer sans rien ajouter.
   - Étape **Utilisateurs test** : ajoutez l'adresse Gmail de **chaque
     moniteur** qui utilisera l'appli (max 100). C'est cette étape qui évite
     d'avoir à faire valider l'appli par Google — indispensable pour un usage
     de club.
   - Enregistrez. L'appli reste en statut « Testing », ce qui est très bien :
     gratuit et sans limite de durée pour vos utilisateurs test.
5. **APIs et services → Identifiants → Créer des identifiants → ID client
   OAuth** :
   - Type d'application : **Application Web**.
   - **Origines JavaScript autorisées** : ajoutez l'URL où l'appli sera
     hébergée, par exemple `https://votre-compte.github.io` (voir §2), et
     `http://localhost:5173` si vous testez en local.
   - Créez, puis copiez le **Client ID** généré (finit par
     `.apps.googleusercontent.com`).
6. Ouvrez [js/config.js](js/config.js) et remplacez la valeur de
   `GOOGLE_CLIENT_ID` par ce Client ID.

> **Pourquoi le scope Drive complet et pas le scope restreint « drive.file » ?**
> Avec `drive.file`, chaque moniteur ne verrait que les fichiers qu'il a
> lui-même créés (ou explicitement ouverts). Pour que les séances saisies par
> un collègue apparaissent automatiquement, l'appli a besoin du scope complet
> `drive` sur le compte de chaque moniteur connecté. C'est pour cela que
> l'étape « Utilisateurs test » ci-dessus est importante : elle limite qui
> peut se connecter à l'appli.

### 1.2 Héberger l'appli (nécessaire — pas de `file://`)

Les navigateurs interdisent les modules JavaScript et les Service Workers en
ouvrant simplement le fichier `index.html`. Il faut un vrai serveur HTTPS.
Le plus simple et gratuit : **GitHub Pages**.

```bash
cd "appli EDP"
git init
git add .
git commit -m "Première version de l'appli Séances Kayak"
```

Créez un dépôt GitHub (public ou privé), poussez-y ce dossier, puis activez
**Settings → Pages → Deploy from branch → main**. Votre appli sera en ligne
sur `https://votre-compte.github.io/nom-du-repo/`.

⚠️ Pensez à revenir à l'étape 1.1.5 pour ajouter cette URL exacte aux
« Origines JavaScript autorisées » de votre Client ID Google.

*Pour tester en local avant de publier* — si vous avez [Node.js](https://nodejs.org) :

```bash
npx serve .
```

Sinon, sous Windows, un petit serveur sans dépendance est fourni
([tools/serve.ps1](tools/serve.ps1)) :

```powershell
powershell -ExecutionPolicy Bypass -File "tools\serve.ps1" -Port 8123
```

puis ouvrez `http://localhost:8123/index.html`. Pensez à ajouter
`http://localhost:8123` aux « Origines JavaScript autorisées » du Client ID
(étape 1.1.5) pour que la connexion Google fonctionne en local.

### 1.3 Premier lancement

1. Ouvrez l'appli, onglet **⚙️ Réglages**.
2. **Se connecter avec Google** (le compte doit être dans la liste des
   « Utilisateurs test » configurée en 1.1.4 — sinon Google refusera l'accès
   avec un message « app not verified »).
3. **Créer un nouvel espace** : un dossier `EDP-Kayak` est créé dans le Google
   Drive de cette personne, avec des sous-dossiers `seances`, `utilisateurs`,
   `evaluations`.
4. Dans **Google Drive**, partagez ce dossier `EDP-Kayak` (clic droit →
   *Partager*) avec l'adresse Gmail de chaque moniteur, en accès
   **Éditeur**.
5. Chaque autre moniteur ouvre l'appli, se connecte avec son propre compte
   Google (préalablement ajouté aux « Utilisateurs test »), puis dans
   **Réglages → Rejoindre un espace**, colle le lien du dossier partagé reçu
   par email (ou son ID, visible dans l'URL Drive).

C'est fait : toutes les séances saisies par n'importe quel moniteur
apparaissent désormais chez tout le monde (synchronisation automatique toutes
les 5 minutes, ou immédiate via le bouton **🔄 Synchroniser maintenant**).

---

## 2. Générer le fichier APK Android

Une fois l'appli en ligne (§1.2) :

1. Allez sur [pwabuilder.com](https://www.pwabuilder.com/).
2. Collez l'URL de votre appli hébergée, cliquez sur **Start**.
3. PWABuilder analyse le `manifest.json` — s'il propose de générer/compléter
   des icônes manquantes, laissez-le faire (il part de `icons/icon.svg`).
4. Onglet **Android** → **Generate Package** → choisissez le mode « Signing
   key » *Generate new* (PWABuilder crée et vous fournit un `.apk` signé,
   prêt à installer).
5. Téléchargez le `.apk` et transférez-le sur les téléphones Android des
   moniteurs (ou publiez-le sur le Play Store si vous voulez aller plus
   loin — PWABuilder fournit aussi le `.aab` nécessaire).

L'APK ouvre en fait votre appli hébergée, dans une fenêtre sans barre de
navigateur : toute mise à jour du site (nouveau `git push`) se reflète
automatiquement dans l'appli installée, sans devoir regénérer l'APK.

---

## 3. Utilisation au quotidien

- **Saisie** : appuyez sur *Localiser automatiquement* en arrivant sur le
  spot — rivière, débit, météo se remplissent seuls. Cochez les participants,
  ajoutez vos notes, enregistrez.
- **Séances** : tableau de bord (nombre de séances, débit moyen, répartition
  par rivière/mois) + liste filtrable. Touchez une séance pour la modifier.
- **Progression** : choisissez un·e adhérent·e, dépliez un niveau de pagaie
  couleur pour cocher les critères déjà maîtrisés. Une fois tous les
  critères d'un niveau validés, il apparaît comme acquis.
- **Réglages** : compte Google, gestion de l'espace collaboratif, ajout des
  moniteurs/adhérents.

### Fonctionnement hors-ligne

L'appli s'installe (bouton « Ajouter à l'écran d'accueil » du navigateur, ou
l'APK) et fonctionne sans réseau : les séances saisies hors-ligne sont
stockées localement et envoyées vers Drive automatiquement dès que la
connexion revient (bandeau « en attente d'envoi » dans Réglages).

---

## 4. Prochaine étape : espace adhérents

Cette première version cible les moniteurs. Pour ouvrir un accès en lecture
seule aux adhérents (consultation de leur seule progression), l'approche la
plus simple sera d'ajouter un rôle « lecture seule » filtrant l'écran
Progression sur l'utilisateur connecté — n'hésitez pas à redemander cette
évolution le moment venu.

---

## 5. Structure du projet

```
appli EDP/
├── index.html            Page principale
├── manifest.json          Métadonnées PWA (icône, nom, couleurs)
├── service-worker.js       Cache hors-ligne de l'app shell
├── css/style.css          Styles (clair/sombre automatique)
├── data/pagaies-couleur.json   Référentiel FFCK (modifiable)
└── js/
    ├── config.js           ⚠️ Client ID Google à renseigner
    ├── auth.js             Connexion Google (Identity Services)
    ├── drive.js             Appels API Google Drive
    ├── store.js             Cache local + synchronisation hors-ligne
    ├── geo.js                Géolocalisation, rivière proche, Hub'Eau
    ├── weather.js            Météo (Open-Meteo)
    ├── sessions.js, users.js, evaluations.js, progression.js
    ├── charts.js             Graphiques SVG maison
    └── ui/                   Les 4 écrans (saisie, consultation, progression, réglages)
```

## 6. Sources des données

- Référentiel Pagaies Couleurs : [FFCK — Référentiels officiels](https://www.ffck.org/formation/pagaies-couleurs/referentiels-pagaies-couleurs/)
  (documents Kayak Blanche/Jaune 2022 et Rivière Sportive Verte/Bleue/Rouge/Noire 2023).
- Débit et hauteur d'eau : [Hub'Eau — Hydrométrie](https://hubeau.eaufrance.fr/page/api-hydrometrie) (Ministère de la Transition écologique).
- Météo : [Open-Meteo](https://open-meteo.com/) (gratuit, sans clé).
- Cours d'eau à proximité : [OpenStreetMap / Overpass API](https://overpass-api.de/).
