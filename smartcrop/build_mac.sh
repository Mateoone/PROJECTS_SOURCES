#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# SmartCrop — Build macOS (.app)
# Génère dist/SmartCrop.app — autonome, sans Python ni dépendances requises.
# ─────────────────────────────────────────────────────────────────────────────
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV="$DIR/.venv"

# ── Vérifier le venv ──────────────────────────────────────────────────────
if [ ! -f "$VENV/bin/python" ]; then
    echo "❌  Environnement virtuel introuvable. Lancez d'abord : bash install.sh"
    exit 1
fi

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   SmartCrop — Build macOS (.app)         ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ── Installer PyInstaller ─────────────────────────────────────────────────
echo "→  Installation de PyInstaller…"
"$VENV/bin/pip" install pyinstaller --upgrade --quiet
echo "✓  PyInstaller prêt"

# ── Nettoyer les anciens builds ───────────────────────────────────────────
rm -rf "$DIR/dist" "$DIR/build" "$DIR/SmartCrop.spec"

# ── Build ─────────────────────────────────────────────────────────────────
echo "→  Construction du bundle (peut prendre 1-2 min)…"
cd "$DIR"

"$VENV/bin/pyinstaller" \
    --name "SmartCrop" \
    --windowed \
    --onedir \
    --noconfirm \
    --collect-all customtkinter \
    --collect-all anthropic \
    --collect-all httpx \
    --collect-all httpcore \
    --collect-all anyio \
    --collect-all certifi \
    --collect-all PIL \
    --collect-all numpy \
    --hidden-import "tkinter" \
    --hidden-import "tkinter.filedialog" \
    --hidden-import "tkinter.messagebox" \
    "$DIR/smartcrop.py"

# ── Vérifier ce que PyInstaller a produit ────────────────────────────────
APP="$DIR/dist/SmartCrop.app"
BIN="$DIR/dist/SmartCrop/SmartCrop"

if [ -d "$APP" ]; then
    # Cas idéal : PyInstaller a créé le .app directement
    echo "✓  .app créé par PyInstaller"

elif [ -f "$BIN" ]; then
    # Cas courant avec certaines versions : bundle onedir sans .app wrapper
    # On crée manuellement la structure .app standard macOS
    echo "→  Création manuelle de la structure .app…"

    mkdir -p "$APP/Contents/MacOS"
    mkdir -p "$APP/Contents/Resources"

    # Info.plist minimal
    cat > "$APP/Contents/Info.plist" << 'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleName</key>             <string>SmartCrop</string>
    <key>CFBundleDisplayName</key>      <string>SmartCrop</string>
    <key>CFBundleIdentifier</key>       <string>com.smartcrop.app</string>
    <key>CFBundleVersion</key>          <string>1.0.0</string>
    <key>CFBundlePackageType</key>      <string>APPL</string>
    <key>CFBundleExecutable</key>       <string>SmartCrop</string>
    <key>NSHighResolutionCapable</key>  <true/>
    <key>NSRequiresAquaSystemAppearance</key> <false/>
    <key>LSMinimumSystemVersion</key>   <string>12.0</string>
</dict>
</plist>
PLIST

    # Copier tout le contenu du bundle onedir dans MacOS/
    cp -R "$DIR/dist/SmartCrop/"* "$APP/Contents/MacOS/"

    # Le lanceur principal doit être exécutable
    chmod +x "$APP/Contents/MacOS/SmartCrop"

    # Nettoyer le dossier intermédiaire
    rm -rf "$DIR/dist/SmartCrop"

    echo "✓  Structure .app créée"
fi

# ── Résultat final ────────────────────────────────────────────────────────
if [ -d "$APP" ]; then
    SIZE=$(du -sh "$APP" | cut -f1)
    echo ""
    echo "══════════════════════════════════════════════"
    echo "  ✓ SmartCrop.app créé  ($SIZE)"
    echo ""
    echo "  Emplacement : dist/SmartCrop.app"
    echo ""
    echo "  Distribution :"
    echo "  • Glissez SmartCrop.app dans /Applications"
    echo "  • Ou : clic droit → Compresser → envoyez le .zip"
    echo "══════════════════════════════════════════════"
    echo ""
    open "$DIR/dist"
else
    echo "❌  Build échoué — aucun .app trouvé dans dist/"
    exit 1
fi
