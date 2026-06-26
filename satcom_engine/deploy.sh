#!/usr/bin/env bash
# Deploiement Cloud Run. Ajuster PROJECT_ID / REGION / SERVICE pour matcher
# tes autres projets sats (region Paris = europe-west9 ; Belgique = europe-west1).
# Idealement, laisser Claude Code lancer ce deploiement pour calquer la convention
# exacte (Artifact Registry, auth/ingress, nommage) des projets voisins.
set -euo pipefail

PROJECT_ID="${PROJECT_ID:?Definir PROJECT_ID}"
REGION="${REGION:-europe-west1}"
SERVICE="${SERVICE:-satcom-coverage-engine}"
# CORS_ORIGINS : restreindre en prod (ex: https://app.exemple.fr)
CORS_ORIGINS="${CORS_ORIGINS:-*}"

echo ">> Tests avant deploiement"
python -m pytest -q

echo ">> Deploiement de $SERVICE sur $REGION (projet $PROJECT_ID)"
# --source utilise le Dockerfile present (sinon buildpacks) via Cloud Build.
gcloud run deploy "$SERVICE" \
  --source . \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --port 8080 \
  --memory 512Mi \
  --cpu 1 \
  --max-instances 5 \
  --set-env-vars "CORS_ORIGINS=${CORS_ORIGINS}" \
  --allow-unauthenticated   # retirer si tes projets sats exigent l'auth IAM

echo ">> URL du service :"
gcloud run services describe "$SERVICE" --project "$PROJECT_ID" --region "$REGION" \
  --format 'value(status.url)'
