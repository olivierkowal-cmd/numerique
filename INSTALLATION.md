# Mettre en ligne le site « Formation numérique »

Ce dossier (`site-web`) est un **site web ordinaire** : des fichiers (index.html, css, js, images). Les données (comptes, progression, chapitres ouverts) restent dans **ton Google Sheet**. Google Apps Script ne sert plus qu'à répondre aux demandes du site.

Durée : environ 30 minutes, une seule fois. Il y a deux parties : **A) le serveur de données** et **B) le site**.

---

## A) Le serveur de données (Google Sheet + Apps Script)

Tu as besoin du compte Google de l'école (@ismreves.net). Les fichiers de cette partie sont dans le dossier `site/projet-apps-script` (`Code.gs` et `DefisDocs.html`) et `site/exercices-a-mettre-dans-Drive` (les 9 exercices) de ton projet, pas dans `site-web`.

1. **Crée un Google Sheet vide**, par exemple « Formation numérique – résultats ».
2. Dans ce Sheet : menu **Extensions → Apps Script**.
3. Remplace tout le contenu de `Code.gs` par celui du fichier `Code.gs` du projet. Puis clique sur **+** à côté de « Fichiers » → **HTML**, nomme-le exactement `DefisDocs` (sans « .html ») et colle le contenu de `DefisDocs.html`. Enregistre (disquette).
4. En haut, choisis la fonction **`installer`** puis **Exécuter**. Accepte les autorisations (« Paramètres avancés » → « Accéder au projet »). Des onglets apparaissent dans le Sheet, un dossier « Formation numérique – exercices » est créé dans ton Drive, et tu reçois un mail.
5. **Dépose les 9 exercices** (dossier `exercices-a-mettre-dans-Drive`) dans ce dossier de ton Drive, sans les renommer. Tu peux relancer `installer` : le mail dit s'il en manque.
6. **Déployer → Nouveau déploiement → roue ⚙ → Application Web** :
   - Description : au choix
   - **Exécuter en tant que : Moi**
   - **Qui a accès : Tout le monde**
   - **Déployer**, puis **copie l'adresse qui se termine par `/exec`**.
7. Pour être reconnu comme prof, c'est le compte qui a déployé (ou l'adresse écrite dans `PROF_EMAIL` en haut de `Code.gs`) : fais ta « Première visite » avec cette adresse.

> Après chaque modification de `Code.gs` : **Déployer → Gérer les déploiements → ✏️ → Version : Nouvelle version → Déployer**. L'adresse `/exec` ne change pas.

## B) Le site

### 1. Mets l'adresse du serveur dans `config.js`

Ouvre `config.js` avec un éditeur de texte (Bloc-notes, TextEdit en « texte brut »). Colle l'adresse `/exec` entre les guillemets :

```js
API_URL: 'https://script.google.com/macros/s/xxxxxxxx/exec',
```

Le reste est facultatif : `NOM_SITE`, `DOMAINE`, `INACTIVITE_MIN` (déconnexion automatique après 30 minutes sans toucher à l'écran ; `0` = jamais). Si `API_URL` est vide, le site affiche « Il manque l'adresse du serveur : voir INSTALLATION ».

### 2. Mets le dossier en ligne (choisis UNE solution)

- **Netlify Drop (le plus simple)** : va sur `app.netlify.com/drop`, crée un compte gratuit, puis **glisse-dépose le dossier `site-web`** dans la page. Tu obtiens tout de suite une adresse du type `https://ton-site.netlify.app` (tu peux la renommer dans « Site configuration »). Le fichier `_headers` est pris en compte automatiquement (sécurité renforcée).
- **GitHub Pages** : crée un dépôt, envoie-y le **contenu** de `site-web` (le fichier `.nojekyll` doit y être), puis Settings → Pages → Branch `main`, dossier `/ (root)`. Adresse : `https://ton-compte.github.io/ton-depot/`. GitHub Pages ignore `_headers` : la même politique de sécurité est appliquée par la page elle-même (sauf l'interdiction d'être affichée dans le site d'un autre).
- **Cloudflare Pages** : « Créer un projet » → « Téléverser des ressources » → dépose le dossier `site-web`.
- **Hébergement de l'école** : demande à l'informaticien de copier le **contenu** du dossier `site-web` à la racine d'un espace web (HTTPS conseillé).

Tu peux ensuite lier **ton propre nom de domaine** (facultatif) : dans les réglages « Domaines » de l'hébergeur.

### 3. Mettre à jour

Modifie le fichier voulu (par exemple `config.js`), puis **dépose à nouveau le dossier** (Netlify : onglet « Deploys » → glisse le dossier ; GitHub : remplace les fichiers). Les élèves reçoivent la nouvelle version à leur prochaine visite. Les chapitres ouverts ou fermés se changent dans **Espace prof**, sans toucher au site. Une fois le site en ligne, tu peux supprimer ce fichier `INSTALLATION.md` du dossier mis en ligne (il ne contient aucun secret).

### 4. Essayer chez toi avant de mettre en ligne

Dans un terminal, depuis le dossier du projet : `python3 -m http.server -d site-web 8080`, puis ouvre `http://localhost:8080`. (Double-cliquer sur `index.html` ne marche pas : il faut ce petit serveur.)

---

## Ce que voit l'élève

Une simple adresse (`https://ton-site.netlify.app`), à ouvrir dans n'importe quel navigateur, à l'école comme à la maison. Il se connecte avec son adresse de l'école et le mot de passe reçu par mail. La session dure 6 heures. Sur un ordinateur partagé, un bouton **Se déconnecter** est toujours visible (avec la case « Effacer mes données de cet ordinateur », cochée par défaut) et la déconnexion est automatique après 30 minutes sans activité.

## Wi-Fi et réseau de l'école

L'école peut bloquer certains sites. **Teste depuis le Wi-Fi de l'école**, avec un compte élève, avant de l'annoncer. Il faut que ces adresses soient joignables : l'adresse de ton site, **`script.google.com`** et **`script.googleusercontent.com`**. Si ce n'est pas le cas, demande à l'informaticien de l'école d'autoriser `script.google.com` et `script.googleusercontent.com` (et, pour la lecture de PDF/Word/photos, `cdnjs.cloudflare.com`, `cdn.jsdelivr.net`, `fonts.googleapis.com`, `fonts.gstatic.com`).

L'intelligence artificielle facultative de Studio (clé saisie par un adulte) est bloquée par la politique de sécurité du site. Pour l'autoriser, il faudrait ajouter les adresses du fournisseur dans `connect-src` du fichier `_headers` et de la balise `<meta>` de `index.html`.

## Données d'élèves mineurs : à ne pas oublier

- Les adresses mail, noms, classes et résultats sont dans **TON Google Sheet et TON Drive**, pas chez l'hébergeur du site (qui ne reçoit que les fichiers du site, jamais de données d'élèves).
- **Informe les familles** (note de rentrée ou règlement) : quelles données sont gardées, pourquoi, qui y a accès (toi), et à qui s'adresser pour les consulter ou les effacer. Vérifie les règles de ton école et de ton pays.
- Ne partage pas le Sheet. Efface les comptes des élèves partis.
- Garde `API_URL` pour toi si tu veux limiter l'accès : cette adresse est visible dans le code du site (c'est normal), la protection vient des mots de passe.

## En cas de problème

- Page « Il manque l'adresse du serveur » : `API_URL` de `config.js` est vide.
- « Le serveur a répondu quelque chose d'inattendu » : l'adresse n'est pas la bonne, ou l'accès n'est pas « Tout le monde », ou la nouvelle version n'a pas été déployée.
- « Pas de connexion. On réessaie. » : Internet ou réseau d'école. Le travail est gardé et renvoyé dès que possible.
- Un exercice ne s'ouvre pas : le fichier manque dans le dossier Drive (relance `installer`).
- Pas de mail de mot de passe : regarde les indésirables (limite Google d'environ 1 500 mails par jour).

---

## Réglage à ne pas oublier : l'adresse du site dans le mail du mot de passe

Dans `Code.gs` (en haut, bloc `CONFIG`), remplis `URL_SITE` avec l'adresse de ton site, par exemple `'https://ton-site.netlify.app'`.
Sans cela, le mail du mot de passe n'a pas de lien vers le site. Après modification : Déployer → Gérer les déploiements → ✏️ → Nouvelle version → Déployer.

Autres réglages utiles dans le même bloc :
- `ORIGINES_AUTORISEES` : liste des adresses de site autorisées (vide = toutes). C'est un garde-fou léger, pas une vraie sécurité.
- Pour des raisons de confidentialité, quand un élève se trompe d'adresse ou de mot de passe, le site ne dit pas si le compte existe. À l'inscription, il affiche toujours « Si cette adresse est valide, un mot de passe vient d'être envoyé ».
