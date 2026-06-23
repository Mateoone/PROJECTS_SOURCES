/**
 * Contrôleur CesiumJS — globe + rendu des empreintes, trace au sol, heatmap
 * pluie et spots. Mise à jour impérative depuis le résultat de scénario : on
 * réutilise les mêmes entités/primitives et on bascule leur visibilité via
 * `.show` (pas de recréation), pour rester fluide avec de nombreux spots.
 */
import {
  Viewer,
  Ion,
  Cartesian3,
  Color,
  ImageryLayer,
  MapboxStyleImageryProvider,
  PointPrimitiveCollection,
  Entity,
  CallbackProperty,
  CallbackPositionProperty,
  PolygonHierarchy,
  ColorMaterialProperty,
  ConstantProperty,
  HeightReference,
  NearFarScalar,
  Math as CMath,
} from 'cesium';
import type { ScenarioResult } from '../core/scenario';
import type { LayerToggles } from '../store/useStore';

const REUSE_COLORS = [
  Color.fromCssColorString('#4ade80'),
  Color.fromCssColorString('#60a5fa'),
  Color.fromCssColorString('#f59e0b'),
  Color.fromCssColorString('#f472b6'),
];

export class GlobeController {
  private viewer!: Viewer;
  private fp3Entity!: Entity;
  private rainCol!: PointPrimitiveCollection;
  private spotEntities: Entity[] = [];

  private fp3Positions: Cartesian3[] = [];
  private fp43Positions: Cartesian3[] = [];
  private trackPositions: Cartesian3[] = [];
  private satPosition = new Cartesian3();
  private fpColor = Color.LIME.withAlpha(0.25);

  init(container: HTMLElement) {
    const token = import.meta.env.VITE_CESIUM_ION_TOKEN;
    if (token) Ion.defaultAccessToken = token;

    const baseLayer = new ImageryLayer(
      new MapboxStyleImageryProvider({
        // NB : les styles Mapbox "Standard" v3 (avec `imports`, ex. le style
        // demandé cml01wtl5001701sa9o2iasy0) renvoient des tuiles RASTER vides
        // via l'API Static Tiles utilisée par Cesium. On utilise donc un style
        // satellite raster CLASSIQUE, surchargeable via les variables VITE_*.
        username: import.meta.env.VITE_MAPBOX_USER || 'mapbox',
        styleId: import.meta.env.VITE_MAPBOX_STYLE_ID || 'satellite-streets-v12',
        accessToken: import.meta.env.VITE_MAPBOX_TOKEN || '',
        scaleFactor: true,
        credit: '© Mapbox © OpenStreetMap',
      }),
    );

    this.viewer = new Viewer(container, {
      baseLayer,
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      animation: false,
      timeline: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
      shouldAnimate: true,
    });

    const scene = this.viewer.scene;
    scene.globe.baseColor = Color.fromCssColorString('#03070d');
    scene.backgroundColor = Color.fromCssColorString('#01030500');
    this.viewer.cesiumWidget.creditContainer.setAttribute('style', 'display:none');
    this.viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(10, 20, 45_000_000),
      duration: 0,
    });

    // --- Satellite ---
    this.viewer.entities.add({
      position: new CallbackPositionProperty(() => this.satPosition, false),
      point: {
        pixelSize: 12,
        color: Color.CYAN,
        outlineColor: Color.WHITE,
        outlineWidth: 2,
      },
      label: {
        text: 'SAT',
        font: '12px monospace',
        fillColor: Color.CYAN,
        pixelOffset: new Cartesian3(0, -18, 0) as unknown as Cartesian3,
        scaleByDistance: new NearFarScalar(1e6, 1, 5e7, 0.5),
      },
    });

    // --- Empreinte -3 dB (remplie) ---
    this.fp3Entity = this.viewer.entities.add({
      polygon: {
        hierarchy: new CallbackProperty(
          () => new PolygonHierarchy(this.fp3Positions),
          false,
        ),
        material: new ColorMaterialProperty(
          new CallbackProperty(() => this.fpColor, false),
        ),
        outline: true,
        outlineColor: Color.WHITE.withAlpha(0.8),
        height: 0,
      },
    });

    // --- Contour -4.3 dB (croisement spots) ---
    this.viewer.entities.add({
      polyline: {
        positions: new CallbackProperty(() => this.fp43Positions, false),
        width: 1.5,
        material: Color.YELLOW.withAlpha(0.7),
        clampToGround: true,
      },
    });

    // --- Trace au sol ---
    this.viewer.entities.add({
      polyline: {
        positions: new CallbackProperty(() => this.trackPositions, false),
        width: 1.5,
        material: Color.fromCssColorString('#22d3ee').withAlpha(0.6),
        clampToGround: true,
      },
    });

    this.rainCol = scene.primitives.add(new PointPrimitiveCollection());
  }

  /** Recentre la caméra sur le point sub-satellite en cadrant le disque terrestre. */
  focus(latDeg: number, lonDeg: number, altKm: number) {
    // Distance choisie pour bien cadrer la zone vue du satellite (≈ 0.6× alt,
    // borné pour rester lisible en LEO comme en GEO).
    const distM = Math.min(Math.max(altKm * 1000 * 0.6, 6e6), 30e6);
    this.viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(lonDeg, latDeg, distM),
      duration: 1.2,
    });
  }

  /** Met à jour le rendu depuis le résultat de scénario. */
  update(res: ScenarioResult, layers: LayerToggles) {
    // Satellite.
    this.satPosition = Cartesian3.fromDegrees(
      res.orbit.lonDeg,
      res.orbit.latDeg,
      res.orbit.altitudeKm * 1000,
    );

    // Couleur empreinte selon la marge de liaison (vert tenable, rouge non).
    this.fpColor =
      res.linkMarginDb >= 0
        ? Color.fromCssColorString('#22c55e').withAlpha(0.22)
        : Color.fromCssColorString('#ef4444').withAlpha(0.25);

    // Empreinte -3 dB.
    this.fp3Positions = layers.footprint3dB
      ? res.footprint3dB.ring.map((p) => Cartesian3.fromDegrees(p.lonDeg, p.latDeg, 0))
      : [];
    (this.fp3Entity.polygon!.outline as ConstantProperty).setValue(layers.footprint3dB);

    // Contour -4.3 dB.
    this.fp43Positions =
      layers.footprint43dB && res.footprint43dB.ring.length
        ? [...res.footprint43dB.ring, res.footprint43dB.ring[0]].map((p) =>
            Cartesian3.fromDegrees(p.lonDeg, p.latDeg),
          )
        : [];

    // Trace au sol.
    this.trackPositions =
      layers.groundTrack && res.groundTrack.length
        ? res.groundTrack.map((p) => Cartesian3.fromDegrees(p.lonDeg, p.latDeg))
        : [];

    // Heatmap pluie.
    this.rainCol.removeAll();
    if (layers.rainHeatmap) {
      const maxMargin = Math.max(1, ...res.rainSamples.map((s) => s.marginDb));
      for (const s of res.rainSamples) {
        this.rainCol.add({
          position: Cartesian3.fromDegrees(s.lonDeg, s.latDeg, 1000),
          pixelSize: 14,
          color: rainColor(s.marginDb, maxMargin),
        });
      }
    }

    // Spots : empreintes déformées colorées par réutilisation de fréquence.
    for (const e of this.spotEntities) this.viewer.entities.remove(e);
    this.spotEntities = [];
    if (layers.spots && res.spotFootprints.length) {
      for (const spot of res.spotFootprints) {
        const positions = spot.ring.map((p) => Cartesian3.fromDegrees(p.lonDeg, p.latDeg));
        const base = REUSE_COLORS[spot.color % REUSE_COLORS.length];
        const e = this.viewer.entities.add({
          polygon: {
            hierarchy: new PolygonHierarchy(positions),
            material: new ColorMaterialProperty(base.withAlpha(0.28)),
            outline: true,
            outlineColor: base.withAlpha(0.85),
            height: 0,
          },
        });
        this.spotEntities.push(e);
      }
    }
  }

  destroy() {
    if (this.viewer && !this.viewer.isDestroyed()) this.viewer.destroy();
  }
}

/** Échelle de couleur de la marge pluie : bleu (faible) → rouge (forte). */
function rainColor(marginDb: number, maxMargin: number): Color {
  const t = CMath.clamp(marginDb / maxMargin, 0, 1);
  // bleu → cyan → jaune → rouge
  return Color.fromHsl((1 - t) * 0.66, 0.9, 0.5, 0.85);
}

// Évite l'avertissement "unused" pour HeightReference si non utilisé ailleurs.
void HeightReference;
