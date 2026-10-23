# Everybody Hangman — version téléphones

- `public/index.html` : la page du prof (celle qu'on projette).
- `public/eleve.html` : la page des élèves (ouverte via le QR code).
- `netlify/functions/api.mjs` : le petit serveur qui stocke les mots (Netlify Blobs, gratuit).

## Mettre en ligne (une seule fois, ~10 min)

⚠️ Le simple glisser-déposer sur Netlify Drop ne suffit pas : il ne publie que des pages fixes,
sans la partie serveur. Il faut passer par GitHub (rien à installer) :

1. Crée un compte sur github.com → **New repository** (nom au choix, ex. `hangman`) → Create.
2. Clique sur **uploading an existing file** et glisse-y le **contenu** du dossier dézippé
   (`public`, `netlify`, `netlify.toml`, `package.json`). Puis **Commit changes**.
   Vérifie que le dossier `netlify/functions/api.mjs` apparaît bien.
3. Sur netlify.com : **Add new site → Import an existing project → GitHub** → choisis le dépôt.
   Ne change aucun réglage → **Deploy**.
4. Ton jeu est sur `https://ton-site.netlify.app` (renommable dans Site configuration).

Pour modifier le jeu plus tard : remplace le fichier sur GitHub, Netlify republie tout seul.

## En classe

1. Ouvre le site, colle le tableau NetYparéo → « Extraire les prénoms ».
2. « 📱 Saisie sur téléphones » → « Afficher le QR en grand » au tableau.
3. Chaque élève scanne, touche SON prénom, écrit son mot. Le prénom choisi est verrouillé :
   personne d'autre ne peut écrire dans cette case.
4. Tu vois « ✓ mot reçu » ligne par ligne (mots masqués, 👁 pour les voir sur ton PC).
   Un élève s'est trompé de prénom ? Bouton « Libérer » sur la ligne.
   Un élève sans téléphone ? Tape son mot toi-même dans sa case.
5. « Lancer la partie » verrouille la saisie. « Nouvelle manche » la rouvre (les élèves gardent leur case).
