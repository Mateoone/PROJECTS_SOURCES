# Passation déploiement — à coller dans Claude Code

Le service `satcom_engine/` est prêt pour Cloud Run (Dockerfile, entrypoint `$PORT`,
CORS, `deploy.sh`). Prompt suggéré pour Claude Code, qui a accès à tes autres
projets sats et peut en calquer la convention :

---

> Déploie `satcom_engine` sur Cloud Run **en suivant exactement la même convention
> que mes autres projets sats** : même projet GCP, même région, même dépôt Artifact
> Registry, même schéma de nommage de service, et mêmes réglages d'auth / ingress.
> C'est une app FastAPI (`app.main:app`) avec un Dockerfile fourni qui écoute sur
> `$PORT`. Avant de déployer : lance `pytest -q` (les tests rejouent le bilan de
> liaison Yahsat de la feuille Master). Après déploiement, donne-moi l'URL du
> service et configure `CORS_ORIGINS` sur l'origine de mon client web.

---

Sinon, déploiement manuel :

```bash
cd satcom_engine
export PROJECT_ID="<ton-projet>"      # même projet que les autres sats
export REGION="europe-west9"          # Paris (ou la région de tes autres sats)
export SERVICE="satcom-coverage-engine"
./deploy.sh
```
