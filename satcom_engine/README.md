# SATCOM Coverage Engine — microservice de calcul GEO + LEO

Source unique de vérité physique pour l'application de planification de couverture.
Les clients **Unity / Unreal / HTML / Ventuz** n'embarquent aucune physique : ils
interrogent ce service en HTTP et ne consomment que des `LinkResult` normalisés.

Principe d'architecture : **un cœur RF mutualisé, deux fournisseurs de géométrie
interchangeables** (GEO statique / LEO dynamique). Une fois `(range, élévation)`
fournis, la chaîne RF est agnostique à l'orbite — même code pour Syracuse (GEO)
et Amazon Leo (LEO).

```
app/
  models.py     contrat d'I/O (Pydantic) — la frontière stable physique <-> rendu
  geometry.py   look-angles GEO (portés de l'Excel) + LEO (SGP4 / Walker circulaire)
  rf.py         bilan de liaison porté de la feuille Master + table MODCOD (ACM)
  engine.py     orchestration : liaison GEO, scénario LEO (visibilité, handover, dispo)
  main.py       API FastAPI
tests/
  test_validation.py   rejoue les chiffres Yahsat de la feuille Master
```

## Lancer

```bash
pip install -r requirements.txt
uvicorn app.main:app --reload
# Documentation interactive (Swagger) : http://127.0.0.1:8000/docs
pytest -q   # non-régression
```

## Endpoints

| Méthode | Route       | Usage |
|---------|-------------|-------|
| GET     | `/health`   | sonde |
| POST    | `/link`     | liaison GEO instantanée (Syracuse, Inmarsat GX…) |
| POST    | `/scenario` | scénario LEO sur une fenêtre (TLE réels **ou** Walker type Amazon Leo) |

### `/link` — exemple (terminal nano Ka, GEO à 5°E, site Paris)
```json
{
  "site": {"name":"Paris","lat_deg":48.85,"lon_deg":2.35,"elevation_mask_deg":10},
  "terminal": {"name":"NanoBlade-Ka","gt_dbk":10.8},
  "satellite_geo": {"name":"Syracuse-like","longitude_deg":5.0,
                    "eirp_dbw":54,"gt_dbk":9,"transponder_bw_mhz":72,"sfd_dbw_m2":-90}
}
```
Réponse (`LinkResult`) : géométrie (range/az/él), FSPL up/down, C/N up/down/requis,
MODCOD retenu par balayage ACM, débit utile, marge de liaison, faisabilité.

### `/scenario` — exemple (Walker ~Amazon Leo, site Kiev, 30 min)
```json
{
  "site": {"name":"Kiev","lat_deg":50.45,"lon_deg":30.52,"elevation_mask_deg":25},
  "terminal": {"name":"NanoBlade-Ka","gt_dbk":10.8},
  "walker": {"altitude_km":610,"inclination_deg":51.9,"planes":28,"sats_per_plane":28,
             "phasing":1,"eirp_dbw":38,"gt_dbk":6},
  "epoch_iso":"2026-06-26T12:00:00Z","duration_s":1800,"step_s":30,
  "handover_policy":"max_elevation"
}
```
Réponse : série temporelle (satellite servant, élévation, C/N, MODCOD, débit),
liste des handovers, **disponibilité %**. Pour des satellites réels, remplacer
`walker` par une liste `tles` (`{name, line1, line2}`).

## Déploiement Cloud Run

Le service est prêt pour Cloud Run : `Dockerfile` (écoute sur `$PORT`), CORS
configurable (`CORS_ORIGINS`), et `deploy.sh` paramétré. Le déploiement effectif
se fait de préférence depuis **Claude Code**, qui peut calquer la convention des
autres projets sats (projet GCP, région, Artifact Registry, nommage, auth) —
voir `DEPLOY_HANDOFF.md`.

```bash
export PROJECT_ID="<ton-projet>" ; export REGION="europe-west9"
./deploy.sh                       # tests + build + deploy + affichage de l'URL
```

## Clients web

Trois clients légers (vanilla JS, zéro build), pointant par défaut sur le service
Cloud Run déployé. Régler `CORS_ORIGINS` côté service sur l'origine du client en prod.

- `client/timeline.html` — appelle `/scenario` et trace la timeline de visibilité :
  ruban du satellite servant, handovers, courbe d'élévation, infobulle (C/N, MODCOD, débit).
- `client/scenarios.html` — tableau de bord comparant **Syracuse** (GEO X), **Inmarsat GX**
  (GEO Ka) et **Amazon Leo** (LEO Ka) sur 4 cas d'emploi (route Europe, route Golfe,
  Ukraine urbain dense, USV Méditerranée). Débit utile, masquage GEO, disponibilité LEO
  et service recommandé, calculés en direct.
- `client/coverage3d.html` — globe **CesiumJS** avec **TLE réels** (Celestrak : Syracuse 4A/4B,
  Inmarsat 5/GX5/6, 364 sats Amazon Kuiper). Affiche les empreintes de couverture GEO
  (cap d'élévation) et LEO, anime la constellation et le **satellite servant / les handovers**
  (via `/scenario` avec les TLE), avec le graphe de scénario synchronisé sous le globe.
  Imagerie **Esri World Imagery** (satellite photoréel, sans token) ; renseigner `MAPBOX_TOKEN`
  en tête de script pour l'imagerie Mapbox `satellite-streets-v12` identique aux autres apps.
  Timeline moderne : lecture/pause, **coefficient de vitesse**, **sélecteur de date/heure**
  (re-propagation), et graphe scrubbable (clic/glisser pour naviguer).

## Statut de validation

Le chemin **GEO** est rejoué contre l'exemple Yahsat de la feuille Master, au
centième près :

| Grandeur        | Moteur     | Excel      |
|-----------------|------------|------------|
| Distance        | 36457.05 km| ~36457 km  |
| Azimut          | 184.34°    | 184.34°    |
| Élévation       | 61.33°     | ~61.3°     |
| FSPL montant    | 213.2285 dB| 213.2285 dB|
| FSPL descendant | 209.7067 dB| 209.7067 dB|
| Largeur de bruit| 2343.08 kHz| 2343.08 kHz|
| C/N requis      | 6.4154 dB  | 6.4154 dB  |

## Roadmap (prochaines passes)

- **Atténuation auto** : remplacer `rain_margin_db` par ITU-R P.618 (pluie) +
  P.676 (gaz), fonction de l'élévation → variable dans le temps en LEO.
- **TLE Amazon Leo réels** dès qu'ils sont exploitables (sinon Walker).
- **Arbitrage multi-orbite** : endpoint qui choisit la meilleure liaison parmi
  Syracuse / GX / Leo à chaque instant (les scénarios #1 et #2).
- **Grille de couverture** : EIRP/G-T par maille pour générer des contours côté carte.
- **Réconciliation back-offs** : porter le bilan EIRP/HPA par porteuse de la Master
  (nombre de porteuses N, puissance HPA requise) en complément du C/N requis.
