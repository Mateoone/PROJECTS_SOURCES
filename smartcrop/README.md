# SmartCrop

Application macOS de recadrage intelligent par lot, propulsée par l'IA Claude (Anthropic).

## Fonctionnalités

- **Traitement par lot** : sélectionne un dossier entier, crée automatiquement un dossier de sortie
- **Taille cible personnalisable** : définissez largeur × hauteur en pixels
- **Recadrage intelligent par IA** : Claude analyse chaque image, localise le sujet principal et calcule le meilleur cadrage au ratio demandé
- **Alerte utilisateur** : quand le choix est ambigu (confiance < seuil), une fenêtre s'affiche avec deux aperçus côte à côte (recadrage IA vs centré) pour laisser l'utilisateur décider
- **Seuil de confiance réglable** : curseur de 0 % à 100 %
- **Option "IA pour toutes les suivantes"** : supprime les alertes pour le reste du lot

## Prérequis

- Python 3.11+
- macOS (tkinter inclus)
- Clé API Anthropic

## Installation

```bash
pip install -r requirements.txt
```

## Utilisation

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
python smartcrop.py
```

1. Sélectionner le **dossier source** (images JPG, PNG, WEBP, BMP, TIFF)
2. Sélectionner ou confirmer le **dossier de sortie** (créé automatiquement)
3. Saisir la **largeur** et la **hauteur** cibles en pixels
4. Ajuster le **seuil de confiance** si besoin (défaut 70 %)
5. Cliquer **Démarrer**

Les images recadrées sont enregistrées en JPEG (`*_smartcrop.jpg`) dans le dossier de sortie.

## Modèle IA

Utilise `claude-opus-4-6` avec adaptive thinking pour une détection de sujet optimale.
