#!/bin/bash
# Double-cliquez ce fichier pour lancer le backoffice Digital XP.
# Il démarre un petit serveur local et ouvre le navigateur.
# (Le mode serveur local permet la sauvegarde directe dans le fichier JSON.)

cd "$(dirname "$0")" || exit 1
PORT=8777

# Libère le port s'il est déjà utilisé par une ancienne instance
if lsof -i :$PORT >/dev/null 2>&1; then
  echo "Le port $PORT est déjà utilisé — ouverture du navigateur sur l'instance existante."
else
  echo "Démarrage du serveur sur http://localhost:$PORT ..."
  python3 -m http.server $PORT >/dev/null 2>&1 &
  SERVER_PID=$!
  sleep 1
fi

open "http://localhost:$PORT/index.html"

echo ""
echo "  Backoffice Digital XP lancé."
echo "  → http://localhost:$PORT/index.html"
echo ""
echo "  Laissez cette fenêtre ouverte pendant que vous travaillez."
echo "  Fermez-la (ou Ctrl+C) pour arrêter le serveur."
echo ""

# Garde le serveur vivant tant que la fenêtre est ouverte
if [ -n "$SERVER_PID" ]; then
  wait $SERVER_PID
fi
