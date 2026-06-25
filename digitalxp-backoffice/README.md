# Digital XP — Backoffice

Interface d'édition visuelle du fichier `structure_DigitalXP.json` qui pilote
l'expérience interactive (menus en roue, fiches missiles, vidéos, plateformes
3D, scénarios…).

Aucune installation, aucune dépendance : tout tient dans un seul fichier
`index.html`. Charte graphique inspirée de [mbda-systems.com](https://www.mbda-systems.com)
(navy profond + azur, typographie technique).

![aperçu](#)

---

## Lancer le backoffice

### Option recommandée — double-clic (avec sauvegarde directe)

Double-cliquez sur **`Lancer-Backoffice.command`**.
Un petit serveur local démarre et le navigateur s'ouvre sur l'éditeur.
Le fichier `data/structure_DigitalXP.json` est chargé automatiquement et vous
pouvez **sauvegarder directement** dans le fichier (bouton _Sauvegarder_).

> La première fois, macOS peut demander une confirmation :
> _clic droit → Ouvrir_ sur le `.command`.

### Option simple — ouvrir `index.html`

Double-cliquez sur `index.html`. Le navigateur s'ouvre en mode `file://`.
Dans ce mode, cliquez sur **Ouvrir** pour sélectionner votre JSON, éditez, puis
**Exporter** pour télécharger le fichier modifié (la sauvegarde directe n'est pas
possible hors serveur local — c'est une limite des navigateurs).

---

## Comprendre la structure

Le JSON est un **arbre récursif**. Chaque nœud est un « bloc » et peut contenir
des sous-blocs via `sub-items`. Le champ **`template`** détermine le type de bloc
et donc les champs pertinents :

| Type (`template`)        | Bloc                | Icône |
|--------------------------|---------------------|-------|
| *(vide)*                 | Menu / dossier      | 📁    |
| `missile`                | Fiche missile       | 🚀    |
| `movie` / `Movie`        | Vidéo               | 🎬    |
| `image` / `Image`        | Image / diaporama   | 🖼️    |
| `plateforme`             | Plateforme 3D       | 🛩️    |
| `systems`                | Système             | 🛡️    |
| `scenario`               | Scénario            | 🎯    |
| `carousel`               | Carrousel           |       |
| `ID*` (IDmissiles, …)    | Lien de navigation  | 🔗    |

L'éditeur **s'adapte automatiquement** : il regroupe les champs en sections
(Général, Apparence, Position & Caméra 3D, Média, Caractéristiques, Contenu,
Comportement) et choisit le bon widget :

- **Couleurs** (`bleu`, `rouge`, `jaune`…) → pastilles cliquables
- **Booléens** (`visible`, `loop`, `POI`…) → interrupteurs
- **Champs coordonnées** (`PosX,PosY,scale`, `cam3DValues`…) → champs séparés et labellisés
- **Tags / chapitres** (`tags`, `tcTitle`) → puces
- **Textes longs** (`text01`, `Warhead`…) → zones de texte

> Tous les champs inconnus restent éditables dans **Avancé · autres champs**, et
> l'onglet **JSON brut** permet d'éditer un bloc à la main. Aucune donnée n'est
> jamais perdue lors d'un aller-retour.

---

## Fonctionnalités

- 🔎 **Recherche** instantanée (label, titre, id) avec dépliage auto
- ➕ **Ajouter / dupliquer / supprimer** un bloc (au survol d'une ligne)
- ↕️ **Glisser-déposer** pour réorganiser et déplacer dans la hiérarchie
- 💾 **Sauvegarde directe** dans le fichier (mode serveur local) + **Export**
- ♻️ **Auto-sauvegarde** locale anti-perte (restauration de brouillon)
- ⌨️ Raccourcis : `⌘/Ctrl + S` sauvegarder · `⌘/Ctrl + F` rechercher

---

## Prochaine étape — Firebase

L'architecture isole déjà l'accès aux données dans deux fonctions
(`ingest()` pour charger, `saveFile()` / `exportFile()` pour persister).
Le passage à **Firebase** (Firestore ou Realtime Database) consiste à :

1. Ajouter le SDK Firebase (CDN) dans `index.html`.
2. Remplacer le chargement initial (`boot()`) par une lecture du document
   `structure` depuis Firestore.
3. Remplacer `saveFile()` par une écriture du document (avec, idéalement,
   un horodatage/auteur pour l'historique).

Le reste de l'application (arbre, éditeur, widgets) reste inchangé.

---

## Fichiers

```
digitalxp-backoffice/
├── index.html                 ← l'application (tout-en-un)
├── Lancer-Backoffice.command  ← lanceur double-clic (serveur local)
├── data/
│   └── structure_DigitalXP.json
└── README.md
```
