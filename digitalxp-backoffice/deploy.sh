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

echo "→ IAP (login Google) — activation + autorisation du domaine…"
gcloud run services update "$SERVICE" \
  --project "$PROJECT" --region "$REGION" --iap --quiet
# Domaine autorisé (IAM normalise vers le domaine principal de la Cloud Identity).
gcloud beta iap web add-iam-policy-binding \
  --resource-type=cloud-run --service="$SERVICE" --region="$REGION" --project="$PROJECT" \
  --member="domain:wearemip.com" \
  --role="roles/iap.httpsResourceAccessor" --quiet || true

echo ""
echo "✅ Déploiement terminé. URL du service (login Google requis) :"
gcloud run services describe "$SERVICE" \
  --project "$PROJECT" --region "$REGION" \
  --format="value(status.url)"

echo ""
echo "ℹ️  Ouvre simplement l'URL dans un navigateur et connecte-toi avec un compte"
echo "    autorisé (@wearemip.com / organisation). Plus besoin de tunnel."
