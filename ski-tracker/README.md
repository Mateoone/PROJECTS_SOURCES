# ⛷️ Ski Team Tracker

PWA de géolocalisation temps réel pour équipes sur domaines skiables.  
**Offline-first · GPS adaptatif · Routage sur pistes · QR code**

---

## Setup local en 5 commandes

```bash
# 1. Cloner et aller dans le dossier
cd ski-tracker/app

# 2. Installer les dépendances
npm install

# 3. Configurer Supabase (copier et remplir .env.local)
cp .env.example .env.local

# 4. Appliquer le schéma Supabase (CLI Supabase requis)
supabase db push --db-url postgresql://postgres:postgres@localhost:54322/postgres < ../supabase/migrations/001_initial.sql

# 5. Démarrer le serveur de dev
npm run dev
# → http://localhost:5173
```

> **Supabase local** : `supabase start` dans `/supabase/` avant l'étape 4.  
> **Supabase cloud** : coller directement `001_initial.sql` dans l'éditeur SQL du dashboard.

---

## Architecture

```
ski-tracker/
├── app/                          # React + TypeScript + Vite
│   ├── src/
│   │   ├── components/
│   │   │   ├── Map/              # MapLibre GL — tuiles OpenSkiMap
│   │   │   ├── BottomSheet/      # Sheet draggable (équipe + itinéraire)
│   │   │   ├── QRCode/           # Génération & scan QR
│   │   │   ├── CompassOverlay    # Boussole vers le point de RDV
│   │   │   ├── GPSIndicator      # Précision GPS + statut offline
│   │   │   └── POIMenu           # Menu admin pour poser des marqueurs
│   │   ├── hooks/
│   │   │   ├── useGeolocation    # GPS background + sync Supabase
│   │   │   ├── useSupabaseRealtime # Positions & POIs en temps réel
│   │   │   ├── useSession        # Bootstrap auth anonyme
│   │   │   └── useBattery        # Niveau batterie → fréquence GPS
│   │   ├── lib/
│   │   │   ├── routing/          # Parser GeoJSON + graphe + Dijkstra
│   │   │   ├── gps/              # GPS manager + queue offline IndexedDB
│   │   │   └── tiles/            # Pré-cache des tuiles (5km rayon)
│   │   ├── pages/
│   │   │   ├── Home              # Landing / reprise session
│   │   │   ├── AdminSession      # Sélection station + QR code
│   │   │   ├── JoinSession       # Scan QR + saisie prénom
│   │   │   └── Session           # Carte principale
│   │   └── stores/               # Zustand (session, positions, POIs)
│   └── public/manifest.json      # PWA installable
├── supabase/
│   ├── migrations/001_initial.sql # Schéma complet + RLS
│   ├── functions/
│   │   └── create-session-token/  # Edge Function JWT (signer/vérifier)
│   └── seed.sql                   # 3 stations de test
```

---

## Flux utilisateur

### Admin (chef d'équipe)
1. **Créer une session** → choisir la station → recevoir le QR code
2. Partager le QR code ou le lien aux membres
3. Voir la carte avec tous les membres en temps réel
4. Appuyer sur la carte pour **poser un POI** (rendez-vous / danger / info)
5. Les membres voient la **boussole** + l'itinéraire calculé vers le rendez-vous

### Membre
1. Scanner le QR code de l'admin → saisir son prénom → rejoindre
2. Voir sa position et celle des autres sur la carte
3. Recevoir les suggestions de remontées pour rejoindre un point cible

---

## Fonctionnalités

| Feature | Détail |
|---------|--------|
| **GPS adaptatif** | 5s en mouvement, 30s au repos, x2 si batterie < 20% |
| **Offline** | Positions mises en queue IndexedDB, flush au retour du réseau |
| **Pré-cache tuiles** | ~5km autour du centre de station au démarrage (zoom 10–15) |
| **Routage ski** | Graphe Dijkstra sur pistes + remontées OpenSkiMap GeoJSON |
| **QR sécurisé** | JWT signé par Edge Function Supabase (HS256, expiry 12h) |
| **Notifications** | Push notification quand un POI "danger" est posé |
| **PWA installable** | manifest.json complet, icons, splash screens |

---

## Variables d'environnement

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | URL de ton projet Supabase |
| `VITE_SUPABASE_ANON_KEY` | Clé publique anon |

---

## Déployer sur Vercel

```bash
cd ski-tracker/app
npx vercel --prod
# Ajouter les env vars dans le dashboard Vercel
```

## Déployer les Edge Functions

```bash
supabase functions deploy create-session-token
```
