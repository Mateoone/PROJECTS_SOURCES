# SatCov Planner

Outil de **pré-dimensionnement de mission télécom satellite** : géométrie de
couverture + bilan de liaison simplifié + visualisation sur globe 3D.

Définir/récupérer une orbite (LEO / MEO / GEO), calculer et visualiser sur un
globe Cesium les empreintes de projection au sol d'un satellite en fonction de
sa puissance, intégrer l'atténuation due à la pluie (ITU-R) pour estimer la
puissance réellement nécessaire, et décider du type de pavage (faisceau unique
large vs. multi-spots qui se chevauchent).

## Stack

- **React 19 + TypeScript + Vite**
- **CesiumJS** pour le globe 3D (rendu impératif via `GlobeController`)
- **satellite.js** (SGP4/SDP4) pour la propagation de TLE
- **Zustand** pour l'état partagé
- **Vitest** pour les tests du cœur de calcul
- Calculs RF/géo **purs et testables**, totalement séparés du rendu Cesium

## Démarrage

```bash
npm install
npm run dev        # serveur de dev (port 5174)
npm test           # 40 tests du cœur de calcul
npm run build      # build de production
npm run typecheck  # vérification de types
```

> Le fond de carte utilise un token Mapbox de démonstration intégré.
> Pour la production, copiez `.env.example` en `.env` et renseignez vos tokens.

## Architecture

```
src/
  core/                 # 100 % pur, testable, sans Cesium ni React
    constants.ts        # constantes physiques / WGS84
    orbit.ts            # Module 1 — Keplerian + TLE (SGP4), ground track
    geometry.ts         # Module 2 — ray-cast cône/ellipsoïde, empreinte
    linkbudget.ts       # Module 3 — EIRP, FSPL, gain↔HPBW, C/N0 (up+down)
    tiling.ts           # Module 5 — faisceau unique vs pavage hexagonal
    itu/
      p838.ts           # atténuation spécifique γ_R = k·R^α (k,α par régression)
      p618.ts           # atténuation de trajet A_p (méthode complète)
      p839.ts           # hauteur de pluie h_R
      p837.ts           # taux de pluie R_0.01 (presets + grille branchable)
    scenario.ts         # "cerveau" : combine tous les modules (pur)
  store/useStore.ts     # état Zustand
  cesium/GlobeController.ts   # rendu impératif Cesium
  components/           # UI React (panneaux, globe, barre temporelle)
```

## Les 5 modules

1. **Orbite** — classe LEO/MEO/GEO, éléments képlériens ou import TLE
   (SGP4/SDP4), propagation temporelle, trace au sol.
2. **Empreinte & pointage** — faisceau conique (demi-angle = HPBW/2) ray-casté
   sur l'ellipsoïde WGS84. La projection produit naturellement la déformation
   (cercle au nadir → ellipse de plus en plus allongée vers le bord). **Visée
   orientable** : nadir ou cible lat/lon arbitraire (ex. un GEO pointant la
   Suède → empreinte fortement allongée car site oblique). L'angle de site réel
   au point visé pilote la marge pluie. Limitée par l'angle de site minimal ;
   contours -3 dB et -4.3 dB (croisement entre spots).
3. **Bilan de liaison** — EIRP / FSPL / C/N₀, **descendant et montant**, gain
   lié à la HPBW par `G ≈ 10·log10(η·27000/θ²)`. Résolution inverse : EIRP/Pt
   nécessaire et HPBW max admissible pour un C/N requis au bord.
4. **Pluie** — marge requise par disponibilité cible, **polarisation H/V/
   circulaire**.
5. **Pavage** — déduit la HPBW max admissible, compare à la taille angulaire de
   la zone, génère le pavage hexagonal (N spots, réutilisation 3/4 couleurs).
   Chaque spot est ray-casté individuellement → **déformation par spot** traitée
   (ellipses de plus en plus allongées vers le bord), rendu plafonné/sous-
   échantillonné au-delà de ~160 spots pour rester fluide.

## Implémentation ITU-R (pluie)

Faute de bibliothèque JS maintenue de référence, les recommandations ITU-R sont
**implémentées directement à partir des formules**, et testées :

- **P.838-3** — coefficients de régression `k_H, k_V, α_H, α_V` (Tables 1-4) et
  combinaison pour polarisation/angle de site arbitraires (eq. 4 & 5).
  *Validé* : à 10 GHz, polarisation H, on retrouve `k = 0.01217`, `α = 1.2571`
  (valeurs publiées). Voir `p838.test.ts`.
- **P.618-13** — méthode complète §2.2.1.1 (longueur de trajet oblique, facteurs
  de réduction horizontal `r_0.01` et d'ajustement vertical `v_0.01`,
  extrapolation `A_p`). Tests de cohérence physique (croissance avec f, R,
  décroissance avec l'angle de site et p). Voir `p618.test.ts`.
- **P.839** — `h_R = h_0 + 0.36`.
- **P.837** — `R_0.01`.

### Limites connues / pistes d'amélioration

- **P.837 (R₀.₀₁) et P.839 (h₀)** : les grilles numériques mondiales ne sont
  **pas embarquées**. À la place : saisie manuelle, presets climatiques, ou
  approximation latitudinale. Des points d'entrée (`setRainfallGrid`,
  `setRainHeightGrid`) permettent de brancher les grilles réelles.
- Antennes **symétriques** (une seule HPBW) ; pas d'antennes elliptiques.
- **Un seul satellite** à la fois (pas de constellation / handover).
- Quand le lien est très largement infaisable, la « HPBW max admissible » tend
  vers 0 et le nombre de spots calculé devient très grand (signal d'infaisabilité).

## Validation

```
npm test
# 6 fichiers, 40 tests : p838, p618, linkbudget, geometry, orbit, tiling
```

Ancrages physiques notables : période GEO ≈ 86 164 s, demi-angle visible depuis
GEO ≈ 8.7°, FSPL ≈ 182.5 dB pour un lien type GPS, portée nadir GEO ≈ 35 786 km.
