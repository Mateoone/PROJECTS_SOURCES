#!/bin/bash
# Déploiement du backoffice Digital XP sur Cloud Run.
# Projet : DIGITAL AI FACTORY. Accès privé (Google Auth). Région : Paris.
set -euo pipefail

PROJECT="gen-lang-client-0804069470"
REGION="europe-west9"
SERVICE="digitalxp-backoffice"

cd "$(dirname "$0")"

echo "→ Projet courant : $PROJECT"
gcloud config set project "$PROJECT"

echo "→ Activation des APIs (run / cloudbuild / artifactregistry)…"
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  --project "$PROJECT"

echo "→ Déploiement Cloud Run ($REGION) — accès PRIVÉ…"
gcloud run deploy "$SERVICE" \
  --source . \
  --project "$PROJECT" \
  --region "$REGION" \
  --port 8080 \
  --no-allow-unauthenticated \
  --memory 256Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 2 \
  --quiet

echo ""
echo "✅ Déploiement terminé. URL du service :"
gcloud run services describe "$SERVICE" \
  --project "$PROJECT" --region "$REGION" \
  --format="value(status.url)"

echo ""
echo "ℹ️  Accès privé : pour ouvrir l'app en local via un tunnel authentifié :"
echo "    gcloud run services proxy $SERVICE --project $PROJECT --region $REGION"
echo "    puis ouvrez http://localhost:8080"
