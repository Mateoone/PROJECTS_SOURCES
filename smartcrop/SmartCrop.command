#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# SmartCrop – Lanceur macOS  (double-cliquer pour ouvrir)
# ─────────────────────────────────────────────────────────────────────────────

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV="$DIR/.venv"

# ── Vérifier que l'installation a été faite ───────────────────────────────
if [ ! -f "$VENV/bin/python" ]; then
    echo "⚠  Environnement virtuel introuvable."
    echo "   Lancez d'abord : bash install.sh"
    read -p "   Lancer install.sh maintenant ? [O/n] " ans
    if [[ "$ans" != "n" && "$ans" != "N" ]]; then
        bash "$DIR/install.sh"
    else
        exit 1
    fi
fi

# ── Charger ANTHROPIC_API_KEY depuis ~/.zshrc / ~/.zprofile si absente ────
if [ -z "$ANTHROPIC_API_KEY" ]; then
    for rc in "$HOME/.zshrc" "$HOME/.zprofile" "$HOME/.bashrc" "$HOME/.bash_profile"; do
        if [ -f "$rc" ]; then
            KEY=$(grep -E '^export ANTHROPIC_API_KEY=' "$rc" 2>/dev/null \
                  | tail -1 | sed 's/export ANTHROPIC_API_KEY=//' | tr -d '"' | tr -d "'")
            if [ -n "$KEY" ]; then
                export ANTHROPIC_API_KEY="$KEY"
                echo "✓  Clé API chargée depuis $rc"
                break
            fi
        fi
    done
fi

# ── Demander la clé si toujours absente ──────────────────────────────────
if [ -z "$ANTHROPIC_API_KEY" ]; then
    echo ""
    echo "  Clé API Anthropic non trouvée."
    echo "  Obtenez-la sur : https://console.anthropic.com/settings/keys"
    echo ""
    read -p "  Collez votre clé API (sk-ant-...) : " KEY
    if [ -z "$KEY" ]; then
        echo "❌  Clé vide – abandon."
        exit 1
    fi
    export ANTHROPIC_API_KEY="$KEY"

    # Proposition de sauvegarder dans ~/.zshrc
    read -p "  Sauvegarder la clé dans ~/.zshrc pour la prochaine fois ? [O/n] " save
    if [[ "$save" != "n" && "$save" != "N" ]]; then
        echo "" >> "$HOME/.zshrc"
        echo "export ANTHROPIC_API_KEY=\"$KEY\"" >> "$HOME/.zshrc"
        echo "✓  Clé sauvegardée dans ~/.zshrc"
    fi
fi

# ── Lancer SmartCrop ─────────────────────────────────────────────────────
echo ""
echo "  Lancement de SmartCrop…"
cd "$DIR"
exec "$VENV/bin/python" smartcrop.py
