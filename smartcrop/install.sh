#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# SmartCrop – Installation (macOS)
# ─────────────────────────────────────────────────────────────────────────────
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV="$DIR/.venv"

echo ""
echo "╔══════════════════════════════════════╗"
echo "║   SmartCrop — Installation macOS     ║"
echo "╚══════════════════════════════════════╝"
echo ""

# ── 1. Trouver Python 3 ───────────────────────────────────────────────────
PYTHON=""
for candidate in python3 /opt/homebrew/bin/python3 /usr/local/bin/python3; do
    if command -v "$candidate" &>/dev/null; then
        PYTHON="$candidate"
        break
    fi
done

if [ -z "$PYTHON" ]; then
    echo "❌  Python 3 introuvable."
    echo ""
    echo "Installez-le avec Homebrew :"
    echo "   /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
    echo "   brew install python"
    exit 1
fi

PY_VERSION=$("$PYTHON" --version 2>&1)
echo "✓  Python trouvé : $PY_VERSION  ($PYTHON)"

# ── 2. Créer l'environnement virtuel ─────────────────────────────────────
if [ -d "$VENV" ]; then
    echo "✓  Environnement virtuel existant : $VENV"
else
    echo "→  Création de l'environnement virtuel…"
    "$PYTHON" -m venv "$VENV"
    echo "✓  Environnement créé"
fi

# ── 3. Installer les dépendances ─────────────────────────────────────────
echo "→  Installation des dépendances…"
"$VENV/bin/pip" install --upgrade pip --quiet
"$VENV/bin/pip" install --upgrade \
    "anthropic>=0.40.0" \
    "Pillow>=10.0.0" \
    "customtkinter>=5.2.0" \
    "numpy>=1.26.0" \
    --quiet

echo "✓  Dépendances installées"

# ── 4. Rendre le lanceur exécutable ──────────────────────────────────────
chmod +x "$DIR/SmartCrop.command"
echo "✓  Lanceur prêt : SmartCrop.command"

echo ""
echo "══════════════════════════════════════════"
echo "  Installation terminée !"
echo ""
echo "  1. Définir votre clé API Anthropic :"
echo "     export ANTHROPIC_API_KEY=\"sk-ant-...\""
echo ""
echo "  2. Lancer l'application :"
echo "     Double-cliquer sur SmartCrop.command"
echo "     — ou —"
echo "     bash SmartCrop.command"
echo "══════════════════════════════════════════"
echo ""
