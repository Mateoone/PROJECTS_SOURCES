# SmartCrop — Guide d'installation

Application de recadrage intelligent par lot, propulsée par l'IA Claude (Anthropic).

---

## Ce dont vous avez besoin

| Élément | Détails |
|---------|---------|
| Mac | macOS 12 Monterey ou supérieur |
| Python 3 | Inclus sur Mac, ou via [Homebrew](https://brew.sh) |
| Clé API Anthropic | Gratuit à créer — voir étape 3 ci-dessous |

---

## Étape 1 — Télécharger le dossier

Récupérez le dossier **SmartCrop** (envoyé par votre collègue ou disponible sur le dépôt) et placez-le n'importe où sur votre Mac, par exemple dans `Documents/`.

---

## Étape 2 — Installer l'application

1. Ouvrez le **Terminal** (Spotlight → tapez `Terminal`)
2. Glissez-déposez le fichier `install.sh` depuis le dossier SmartCrop dans la fenêtre Terminal
3. Appuyez sur **Entrée**

L'installation prend 1 à 2 minutes. Vous verrez des messages se dérouler — c'est normal.

> **Problème « Python introuvable » ?**
> Installez Homebrew puis Python :
> ```
> /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
> brew install python
> ```

---

## Étape 3 — Obtenir une clé API Anthropic

SmartCrop utilise l'IA Claude d'Anthropic pour analyser vos images. La clé API est **gratuite à créer** (des crédits sont offerts à l'inscription).

1. Allez sur [console.anthropic.com](https://console.anthropic.com/settings/keys)
2. Créez un compte (ou connectez-vous)
3. Cliquez **Create Key** — copiez la clé (commence par `sk-ant-…`)

> **Gardez cette clé secrète** — ne la partagez pas et ne la mettez pas dans un email.

---

## Étape 4 — Lancer SmartCrop

Double-cliquez sur le fichier **`SmartCrop.command`** dans le dossier.

Au premier lancement, l'application vous demande votre clé API.
Collez-la et choisissez de la sauvegarder pour ne plus avoir à la ressaisir.

---

## Utilisation

1. **Dossier source** — cliquez `…` pour choisir le dossier contenant vos images
2. **Dossier de sortie** — créé automatiquement à côté du dossier source
3. **Largeur × Hauteur** — saisissez la taille cible en pixels (ex. 1200 × 800)
4. **Seuil de confiance** — en dessous, l'IA vous demande de valider le cadrage
5. **Suffixe** — personnalisez ou désactivez le suffixe ajouté aux noms de fichiers
6. **Modèle IA** — Haiku (rapide) / Sonnet (équilibré) / Opus (précis)
7. Cliquez **Démarrer**

Les images recadrées sont enregistrées en JPEG dans le dossier de sortie.
Les vignettes montrent l'image originale avec le cadre de découpe en pointillés.

---

## Formats d'image supportés

JPG · PNG · WEBP · BMP · TIFF

---

## Dépannage

| Problème | Solution |
|----------|----------|
| « Environnement virtuel introuvable » | Relancez `install.sh` |
| « ANTHROPIC_API_KEY manquante » | Relancez `SmartCrop.command` et saisissez votre clé |
| Fenêtre qui ne s'ouvre pas | Clic droit sur `SmartCrop.command` → Ouvrir |
| Erreur « _tkinter » | Exécutez `brew install python-tk` dans le Terminal |

---

## Désinstaller

Supprimez simplement le dossier SmartCrop.
La configuration est stockée dans `~/.smartcrop_config.json` — supprimez ce fichier aussi si vous le souhaitez.
