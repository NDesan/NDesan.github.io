# 五輪 Gorin — journal des cinq anneaux

Journal quotidien inspiré du *Livre des cinq anneaux* (Gorin no sho) de Miyamoto Musashi.
Chaque domaine de ta vie est rattaché à un anneau :

| Anneau | Domaine | Métriques |
|---|---|---|
| 地 Terre | Fondations | sommeil (h, qualité), travail profond (h, concentration) |
| 水 Eau | Fluidité | lecture (pages), apprentissage (min) |
| 火 Feu | Combat | sport (min, discipline), bench (charge × reps → 1RM estimé) |
| 風 Vent | Les autres | temps social (h), qualité des échanges |
| 空 Vide | Esprit | méditation (min), humeur, énergie |

**Construire ses journées** :
- **Aujourd'hui** : l'essentiel du jour (une seule priorité), les tâches du jour (modifiables d'un clic, report des tâches d'hier), et le cap (rituels faits, prochaines étapes de tes objectifs).
- **Rituels** dans chaque anneau : une liste d'habitudes cochables, avec ajout rapide. Chaque rituel a un déclencheur (« après mon café… »), une version minimale de 2 minutes, des jours, une série, un taux sur 30 jours et une barre d'ancrage de 66 jours. Alerte « ne manque jamais deux fois ».
- **Objectifs** : vision à 3–5 ans, objectifs par axe (carrière, santé, savoir…), étapes intermédiaires avec échéances réparties automatiquement, repère « dans les temps / en retard », rituels liés, revue de la semaine.
- **Métriques libres** (Réglages) : renomme, ajoute ou retire des métriques (nombre, échelle 1–5, oui/non, choix, texte) et règle leurs objectifs.

**Inspiré du texte** :
- **Gorintō** : la stèle à cinq pierres (cube, sphère, toit, demi-lune, joyau) qui donne son nom au livre ; chaque pierre se remplit selon ton score du jour.
- **Les neuf principes** du livre de la Terre : un principe par jour, que tu notes de 1 à 5.
- **Réflexions** : une question par anneau, tirée de l'enseignement de chaque livre.
- **Page La Voie** : les cinq livres, tes scores par principe, le **tanren** (1 000 jours pour forger, 10 000 pour polir) et les 21 préceptes du **Dokkōdō**.
- **Lectures** : « l'arme favorite » (un anneau domine les autres), « montagne et mer » (une métrique stagne, change d'approche).

Chaque anneau reçoit un score sur 100 (objectif atteint = 100 %), et un score d'**équilibre** fait la moyenne des cinq.

**Insights** : radar des anneaux vs période précédente, trajectoires lissées, calendrier de constance, explorateur de métrique, progression au bench (1RM d'Epley, records), corrélations entre domaines (ex. sommeil → humeur, sport → sommeil du lendemain), semaine type.

Site 100 % statique : aucun serveur, aucune dépendance.

## Déployer sur GitHub Pages

1. Crée un dépôt nommé **`<ton-pseudo>.github.io`** (public).
2. Mets-y le contenu de ce dossier (`index.html`, `style.css`, `musashi.js`, `app.js`, `rituels.js`, `.nojekyll`, `README.md`) :
   ```bash
   git clone https://github.com/<ton-pseudo>/<ton-pseudo>.github.io
   cd <ton-pseudo>.github.io
   # copie les fichiers ici
   git add . && git commit -m "Gorin : journal des cinq anneaux" && git push
   ```
3. Dans **Settings → Pages**, source : *Deploy from a branch*, branche `main`, dossier `/ (root)`.
4. Le site est en ligne sur `https://<ton-pseudo>.github.io` en une minute.

> Tu préfères un autre dépôt (ex. `gorin`) ? Ça marche aussi : le site sera sur `https://<ton-pseudo>.github.io/gorin/`.

## Lier tes données à GitHub (synchro entre appareils)

Sans configuration, les données restent dans le navigateur (localStorage). Pour les sauvegarder dans GitHub :

1. Crée un **dépôt privé** pour les données, ex. `gorin-data` (sinon ton journal serait public).
2. Crée un token : **Settings → Developer settings → Personal access tokens → Fine-grained tokens**
   - *Repository access* : uniquement `gorin-data`
   - *Permissions* → *Contents* : **Read and write**
3. Sur le site, onglet **Réglages → Synchronisation GitHub** : pseudo, `gorin-data`, `main`, chemin `gorin/journal.json`, colle le token.

Chaque enregistrement crée un commit dans `gorin/journal.json` : ton journal est versionné. Sur un autre appareil, renseigne les mêmes réglages et tout est fusionné (la version la plus récente de chaque journée gagne).

Le token n'est stocké que dans le navigateur où tu le saisis. Ne l'utilise pas sur un ordinateur partagé ; tu peux le supprimer avec « Oublier le token ».

## Personnaliser

- Objectifs quotidiens : onglet Réglages.
- Ajouter une métrique : édite le tableau `RINGS` en haut de `app.js` (`type: 'num'` avec `target`, ou `type: 'scale'` pour une note 1–5). Elle apparaît automatiquement dans la saisie, les scores et l'explorateur.
- Export JSON / CSV et import dans Réglages → Données.
