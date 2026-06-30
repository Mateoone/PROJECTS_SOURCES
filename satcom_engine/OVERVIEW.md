# SATCOM Coverage Engine — Vue d'ensemble des fonctionnalités

Moteur de planification de couverture SATCOM (GEO + LEO) et ses interfaces web, déployé
en service unique sur Google Cloud Run.

![Architecture](docs/architecture.png)

## Principe d'architecture

Une idée centrale : **un cœur de physique unique (le moteur), des clients qui ne font que
l'afficher.** Le microservice calcule tous les bilans de liaison ; les interfaces web (et,
à terme, Unity / Unreal / Ventuz) ne consomment que des résultats normalisés (`LinkResult`)
et n'embarquent aucune physique. L'API **et** les interfaces sont servies par **une seule
application Cloud Run**, à la même origine.

---

## 1. Le moteur de calcul (`satcom_engine`, FastAPI)

Microservice Python, **source unique de vérité physique**. Bilan de liaison porté de la
feuille Master (GetSAT / Yahsat) et validé au centième près par des tests de non-régression
(`pytest`).

| Méthode | Route | Rôle |
|---|---|---|
| GET | `/health` | sonde |
| POST | `/link` | **liaison GEO instantanée** (Syracuse, Inmarsat GX…) |
| POST | `/scenario` | **scénario LEO dynamique** sur une fenêtre temporelle |
| GET | `/mapbox-config.json` | sert le token / style Mapbox depuis les variables d'env (hors dépôt) |
| GET | `/`, `/ui/…`, `/docs` | interfaces web + documentation API (Swagger) |

**Physique modélisée**

- **Géométrie** (`geometry.py`) : look-angles GEO (range / azimut / élévation) et propagation
  LEO réelle (SGP4 sur TLE, ou constellation Walker générée).
- **Chaîne RF** (`rf.py`) : FSPL montant / descendant, C/N montant (méthode SFD) et descendant
  (méthode EIRP), combinaison C/N, **C/N requis**, marge de liaison, **table MODCOD ACM DVB-S2X**
  → débit utile.
- **Orchestration** (`engine.py`) : liaison GEO instantanée ; scénario LEO avec choix du
  **satellite servant** par pas, **handovers**, **disponibilité %**.
- **Contrat I/O** (`models.py`) : schémas Pydantic, frontière stable physique ↔ rendu (`LinkResult`).

---

## 2. Couverture 3D (`coverage3d.html`) — application phare

Globe **CesiumJS** piloté par des **TLE réels** (Celestrak).

**Constellations (TLE réels)** : Syracuse 4A/4B (GEO X), Inmarsat 5 / GX5 / 6 (GEO Ka),
364 Amazon Kuiper + ~400 Starlink (LEO Ka).

- **Terre photoréelle** : style Mapbox personnalisé « Glow globe » (injecté par le serveur),
  avec repli Esri / Natural Earth garanti.
- **Empreintes de couverture** GEO et LEO en **transparence + bord lumineux façon Fresnel**
  (on voit la Terre et les petits LEO au travers).
- **Animation de la constellation LEO** + **faisceau du satellite servant** + **handovers**
  en direct (via `/scenario` sur les TLE réels).
- **Sélecteur de segment sol** (Paris, Kiev, Abu Dhabi, Téhéran, Kharkiv urbain dense, USV Méditerranée).
- **Sélecteur de service LEO** (Kuiper / Starlink) pilotant l'animation et les handovers.
- **Couches activables** : Syracuse, Inmarsat GX, Kuiper, Starlink, faisceau.
- **Puissance liaison (C/N reçu)** par type — Syracuse / Inmarsat GX / Kuiper / Starlink — la
  valeur GEO **décroît avec la latitude** (élévation + dépointage faisceau).
- **Timeline moderne** : lecture / pause, **coefficient de vitesse**, **sélecteur de date/heure**
  (re-propagation), **graphe scrubbable** synchronisé avec l'horloge.
- **Fiche satellite au clic** : **vidéo de la constellation** (Syracuse / Inmarsat / Kuiper /
  Starlink) + résumé Wikipédia, NORAD, désignation internationale, bande / orbite, altitude,
  inclinaison, période, vitesse, position et élévation live.
- **Mini-navigation** vers les 4 scénarios.

---

## 3. Comparaison des 4 scénarios (`scenarios.html`)

Tableau de bord d'aide à la décision : **4 services × 4 cas d'emploi**, calculés en direct.

**Cas d'emploi** : route Europe (Paris→Kiev), route Golfe (Abu Dhabi→Téhéran), Ukraine urbain
dense (masque 30°), USV Méditerranée.

- Comparaison **Syracuse (GEO X) / Inmarsat GX (GEO Ka) / Amazon Leo / Starlink (LEO Ka)** :
  débit utile, faisabilité, masquage GEO, disponibilité et handovers LEO.
- **Élévation** + **atténuation pluie ITU-R P.618 / P.838** (R₀.₀₁ par région), réellement injectée
  dans le bilan — d'où l'effet marquant : en Ka le fading pluie peut dépasser 10 dB, et le **X-band
  rustique à la pluie reprend la primauté**.
- **Verdict** par scénario (service recommandé, ou « LEO seul » si le GEO est masqué).
- **Matrice « antenne par service »** : pour voix / image / échange de data / visioconférence /
  vidéo HD, la plus petite classe d'antenne (Manpack, Nano, 0,6 m, 1,0 m) qui ferme le service —
  sinon **LEO requis** ; le temps réel (visio) privilégie le LEO pour la latence.
- **Mini-navigation** vers la Couverture 3D.

---

## 4. Visibilité (`timeline.html`)

Client léger : timeline LEO sur une fenêtre — ruban du satellite servant, handovers, courbe
d'élévation, infobulle (C/N, MODCOD, débit).

---

## 5. Hébergement & exploitation

- **Cloud Run** (projet `gen-lang-client-0804069470`, région Paris `europe-west9`, public),
  build `--source .` via Cloud Build.
- **Interfaces servies par l'API** (`/ui/…`) → même origine que l'API, pas de CORS pour les clients.
- **Page d'accueil** (`/`) avec accès direct aux deux applications et à la doc API.
- Token Mapbox **jamais committé** : il vit uniquement dans les variables d'environnement Cloud Run.
- Clients **vanilla JS, zéro build** (CesiumJS + satellite.js via CDN).

**URL** : https://satcom-coverage-engine-58899663812.europe-west9.run.app/
