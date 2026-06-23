# ▰ PANOPTICON — Plateforme de Surveillance Géospatiale Interactive 3D

Application web full-stack de visualisation, suivi et analyse de données
géospatiales mondiales en temps réel. Thème **Visual HUD / Cyber-Militaire
tactique** : globe 3D haute fidélité, suivi orbital de ~12 000 satellites,
trafic aérien, sismes, caméras CCTV.

![stack](https://img.shields.io/badge/React_18-TS-blue) ![cesium](https://img.shields.io/badge/CesiumJS-globe-emerald) ![sgp4](https://img.shields.io/badge/satellite.js-SGP4-orange)

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  NAVIGATEUR                                                    │
│                                                                │
│   React 18 + TS (HUD)  ──►  CesiumJS  ──►  PointPrimitive (GPU)│
│        │                                        ▲              │
│        ▼                                        │ positions    │
│   Web Worker (satellite.js / SGP4, 10 Hz) ──────┘  (10 Hz)     │
│        ▲                                                       │
│        │ TLE          IndexedDB (cache 2 h)                    │
└────────┼───────────────────────────────────────────────────── ┘
         │ /api/*  (proxy, GZIP, cache, clés masquées)
┌────────▼───────────────────────────────────────────────────── ┐
│  SERVEUR EXPRESS                                                │
│   /api/tle          22 groupes Celestrak agrégés + cache 2 h   │
│   /api/aircraft     OpenSky (bbox du cône caméra) + repli      │
│   /api/earthquakes  USGS (séismes de l'heure)                  │
│   /api/webcams      Windy v3 + repli flux municipaux           │
└─────────────────────────────────────────────────────────────  ┘
```

## Fonctionnalités

### A. Suivi orbital temps réel
- **~12 000–15 000 satellites** : le backend agrège **22 groupes Celestrak**
  (active, stations, visual, starlink, oneweb, iridium, gps/glonass/galileo/
  beidou, geo, intelsat, weather, cubesat…) avec requêtes cadencées et cache
  mémoire 2 h pour éviter le rate-limiting.
- **Propagation SGP4** dans un Web Worker dédié (satellite.js) à **10 Hz** :
  lat/lon/altitude, vitesse, classe orbitale (LEO/MEO/GEO/HEO).
- **Rendu GPU** : `PointPrimitiveCollection` mise à jour par référence via un
  `Float32Array` transférable — aucun diff React, aucune recréation d'entité.
- **Trajectoire orbitale** : clic sur un satellite → tracé d'une révolution
  complète projetée en 3D + fiche détaillée (incl., période, apogée/périgée).

### B. Couches terrestres
- **AIR** — trafic aérien OpenSky filtré sur le cône de vision caméra.
- **SIS** — séismes USGS de l'heure, catégorisés par magnitude/profondeur.
- **CCTV** — webcams Windy v3 (ou flux municipaux de repli) géolocalisées.

### C. Interface tactique (HUD)
- Centre de contrôle latéral escamotable : calques, recherche instantanée
  (nom / NORAD ID), terminal de log télémétrique défilant.
- Panneau de détails dynamique + widget feed de télémétrie orbitale.
- **Mode NVG** : shader post-processing vision nocturne verte (grille + scan).
- **Raccourcis clavier** : `1-4` calques, `N` NVG, `M` audio.

### D. Univers sonore
- Web Audio 100 % synthétisé (oscillateurs, aucun fichier) : bips de saisie,
  alarmes sismiques, balayages système, séquence d'initialisation.

## Démarrage

```bash
npm install
cp .env.example .env      # optionnel : clés Windy / OpenSky / token Cesium ion
npm run dev               # lance le proxy Express (8787) + Vite (5173)
```

Puis ouvrir http://localhost:5173

> Sans token Cesium ion ni clés d'API, l'app fonctionne : fond carto sombre
> CARTO (sans token), OpenSky en quota anonyme, webcams municipales de repli.

### Production

```bash
npm run build
npm start                 # Express sert dist/ + les API sur le port 8787
```

## Variables d'environnement (`.env`)

| Variable | Rôle | Requis |
|---|---|---|
| `PORT` | Port du proxy Express | non (8787) |
| `VITE_CESIUM_ION_TOKEN` | Imagerie/terrain Cesium ion | non |
| `WINDY_API_KEY` | Webcams Windy v3 | non (repli) |
| `OPENSKY_USER` / `OPENSKY_PASS` | Quota OpenSky élargi | non |

## Pile technique

React 18 · TypeScript · Vite · CesiumJS · satellite.js · Zustand ·
Tailwind CSS · Express · compression (GZIP) · IndexedDB · Web Worker · Web Audio.
