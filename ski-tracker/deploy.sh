#!/usr/bin/env bash
# ============================================================
# Ski Team Tracker — One-shot GCP + Supabase deployment
# Usage: ./ski-tracker/deploy.sh <GCP_PROJECT_ID>
# ============================================================
set -euo pipefail

PROJECT_ID="${1:?Usage: ./deploy.sh <GCP_PROJECT_ID>}"
REGION="europe-west1"
SERVICE="ski-tracker"
REPO="ski-tracker"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/app"

SUPABASE_URL="https://cpbaomccpneahpjxgyae.supabase.co"
SUPABASE_ANON_KEY="sb_publishable_6XJuJqV6A_9rmbdjM3azHA_es-byRLG"

echo "🚀 Deploying Ski Team Tracker to Cloud Run (project: ${PROJECT_ID})"
echo ""

# ── 1. Enable required APIs ──────────────────────────────────
echo "1/6 Enabling GCP APIs..."
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com \
  --project="${PROJECT_ID}" --quiet

# ── 2. Create Artifact Registry repo ────────────────────────
echo "2/6 Creating Artifact Registry repository..."
gcloud artifacts repositories create "${REPO}" \
  --repository-format=docker \
  --location="${REGION}" \
  --project="${PROJECT_ID}" \
  --quiet 2>/dev/null || echo "  (already exists)"

# ── 3. Store secrets in Secret Manager ──────────────────────
echo "3/6 Storing Supabase credentials in Secret Manager..."
echo -n "${SUPABASE_URL}" | \
  gcloud secrets create ski-tracker-supabase-url \
    --data-file=- --project="${PROJECT_ID}" --quiet 2>/dev/null || \
  echo -n "${SUPABASE_URL}" | \
  gcloud secrets versions add ski-tracker-supabase-url \
    --data-file=- --project="${PROJECT_ID}" --quiet

echo -n "${SUPABASE_ANON_KEY}" | \
  gcloud secrets create ski-tracker-supabase-anon-key \
    --data-file=- --project="${PROJECT_ID}" --quiet 2>/dev/null || \
  echo -n "${SUPABASE_ANON_KEY}" | \
  gcloud secrets versions add ski-tracker-supabase-anon-key \
    --data-file=- --project="${PROJECT_ID}" --quiet

# ── 4. Build & push Docker image ────────────────────────────
echo "4/6 Building Docker image..."
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
docker build \
  --tag "${IMAGE}:latest" \
  --build-arg "VITE_SUPABASE_URL=${SUPABASE_URL}" \
  --build-arg "VITE_SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}" \
  --file "${SCRIPT_DIR}/Dockerfile" \
  "${SCRIPT_DIR}"

echo "  Pushing image..."
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet
docker push "${IMAGE}:latest"

# ── 5. Deploy to Cloud Run ───────────────────────────────────
echo "5/6 Deploying to Cloud Run..."
gcloud run deploy "${SERVICE}" \
  --image="${IMAGE}:latest" \
  --region="${REGION}" \
  --platform=managed \
  --allow-unauthenticated \
  --min-instances=0 \
  --max-instances=5 \
  --memory=256Mi \
  --cpu=1 \
  --port=8080 \
  --set-env-vars="VITE_SUPABASE_URL=${SUPABASE_URL},VITE_SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}" \
  --project="${PROJECT_ID}" \
  --quiet

# ── 6. Get service URL ───────────────────────────────────────
echo "6/6 Getting service URL..."
URL=$(gcloud run services describe "${SERVICE}" \
  --region="${REGION}" \
  --project="${PROJECT_ID}" \
  --format="value(status.url)")

echo ""
echo "✅ Déployé avec succès !"
echo "   URL : ${URL}"
echo ""
echo "📱 Installe l'app : ouvre ${URL} sur ton iPhone/Android"
echo "   et ajoute à l'écran d'accueil."
