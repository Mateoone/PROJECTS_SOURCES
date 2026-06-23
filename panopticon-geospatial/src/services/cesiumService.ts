/**
 * Contrôleur CesiumJS — gère le globe, les couches et le rendu GPU.
 *
 * Les satellites (jusqu'à ~14 000) sont rendus dans une PointPrimitiveCollection
 * mise à jour PAR RÉFÉRENCE à chaque trame réseau du worker : on écrit
 * directement la position de chaque point, sans diff React ni recréation
 * d'entités (ce qui ferait planter l'UI à ce volume).
 */
import {
  Viewer,
  Ion,
  Cartesian3,
  Color,
  ImageryLayer,
  MapboxStyleImageryProvider,
  PointPrimitiveCollection,
  type PointPrimitive,
  BillboardCollection,
  PolylineCollection,
  type Polyline,
  Material,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Math as CMath,
  PostProcessStage,
  HeadingPitchRange,
  NearFarScalar,
  Rectangle,
} from 'cesium';
import type {
  Aircraft,
  Earthquake,
  LayerId,
  OrbitClass,
  SatMeta,
  Selection,
  TleRecord,
  Webcam,
} from '../types';

const CLASS_COLOR = {
  LEO: Color.fromCssColorString('#10ffa0'),
  MEO: Color.fromCssColorString('#5fd2ff'),
  GEO: Color.fromCssColorString('#ffb347'),
  HEO: Color.fromCssColorString('#fff04d'),
  SSO: Color.fromCssColorString('#c77dff'),
};

// Icône caméra CCTV (data-URI SVG) — claire pour que les clusters denses
// « brillent » en ambre au lieu de former une masse noire.
const CAMERA_ICON =
  'data:image/svg+xml;base64,' +
  btoa(
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">' +
      '<rect x="3" y="7" width="11" height="9" rx="1.5" fill="#ffb347" stroke="#fff0d0" stroke-width="0.8"/>' +
      '<path d="M14 9.5l6-3v11l-6-3z" fill="#ffb347" stroke="#fff0d0" stroke-width="0.8"/>' +
      '<circle cx="8.5" cy="11.5" r="1.8" fill="#fff0d0"/></svg>',
  );

// Icône d'avion (vue de dessus, pointe vers le nord) en data-URI SVG.
const PLANE_ICON =
  'data:image/svg+xml;base64,' +
  btoa(
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">' +
      '<path fill="#5fd2ff" stroke="#04222e" stroke-width="0.8" ' +
      'd="M12 1.5c.7 0 1.1.8 1.1 2v5.4l8.4 5v2l-8.4-2.6v5.1l2.4 1.8v1.3L12 21l-3.5 1.3v-1.3l2.4-1.8v-5.1L2.5 15.9v-2l8.4-5V3.5c0-1.2.4-2 1.1-2z"/></svg>',
  );

// Shader NVG : luminance verte fluorescente + grille de balayage + vignette + bruit.
const NVG_SHADER = `
uniform sampler2D colorTexture;
in vec2 v_textureCoordinates;
float rand(vec2 c){ return fract(sin(dot(c, vec2(12.9898,78.233))) * 43758.5453); }
void main() {
  vec2 uv = v_textureCoordinates;
  vec4 src = texture(colorTexture, uv);
  float lum = dot(src.rgb, vec3(0.299, 0.587, 0.114));
  lum = pow(lum, 0.65) * 1.45;
  vec3 green = vec3(0.05, lum, 0.12);
  // grille de balayage
  float grid = step(0.97, fract(uv.y * 140.0)) + step(0.985, fract(uv.x * 180.0));
  green += vec3(0.0, grid * 0.18, 0.0);
  // ligne de scan animée
  float scan = smoothstep(0.0, 0.02, abs(fract(uv.y * 1.0 - czm_frameNumber * 0.002) - 0.5) - 0.48);
  green += vec3(0.0, (1.0 - scan) * 0.12, 0.0);
  // bruit de capteur
  green += (rand(uv * czm_frameNumber) - 0.5) * 0.08;
  // vignette
  float d = distance(uv, vec2(0.5));
  green *= smoothstep(0.85, 0.35, d);
  out_FragColor = vec4(green, 1.0);
}`;

export class GlobeController {
  viewer!: Viewer;
  private satCollection!: PointPrimitiveCollection;
  private satPoints: PointPrimitive[] = [];
  private satMeta: SatMeta[] = [];
  private orbitLines!: PolylineCollection;
  private orbit: Polyline | null = null;
  private nvgStage: PostProcessStage | null = null;
  private scratch = new Cartesian3();
  private destroyed = false;
  private onPick: (sel: Selection) => void = () => {};

  /** Vrai si le viewer n'est plus utilisable (callbacks async à ignorer). */
  private get dead() {
    return this.destroyed || !this.viewer || this.viewer.isDestroyed();
  }

  // Couches terrestres (entités gérées séparément).
  private aircraftCol!: BillboardCollection;
  private quakeCol!: PointPrimitiveCollection;
  private webcamCol!: BillboardCollection;
  private aircraftData: Aircraft[] = [];
  private quakeData: Earthquake[] = [];
  private webcamData: Webcam[] = [];

  init(container: HTMLElement, onPick: (sel: Selection) => void) {
    this.onPick = onPick;
    const token = import.meta.env.VITE_CESIUM_ION_TOKEN;
    if (token) Ion.defaultAccessToken = token;

    // Fond Mapbox. NB : l'API Static Tiles (raster, requise par Cesium) ne sait
    // PAS rasteriser les styles Mapbox "Standard" v3 (avec `imports`) — ils
    // renvoient des tuiles vides. On utilise donc un style classique raster
    // (satellite + labels), surchargeable via VITE_MAPBOX_STYLE_ID.
    const baseLayer = new ImageryLayer(
      new MapboxStyleImageryProvider({
        username: import.meta.env.VITE_MAPBOX_USER || 'mateoone',
        styleId: import.meta.env.VITE_MAPBOX_STYLE_ID || 'cjlnf6d743q5r2rmhuby8b2ym',
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
    scene.globe.baseColor = Color.fromCssColorString('#02060a');
    scene.globe.enableLighting = false;
    if (scene.skyAtmosphere) {
      scene.skyAtmosphere.hueShift = -0.35;
      scene.skyAtmosphere.saturationShift = 0.4;
    }
    scene.backgroundColor = Color.fromCssColorString('#01030500');
    scene.fog.enabled = true;
    this.viewer.cesiumWidget.creditContainer.setAttribute('style', 'display:none');

    // Vue initiale.
    this.viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(10, 30, 26_000_000),
      duration: 0,
    });

    this.satCollection = scene.primitives.add(new PointPrimitiveCollection());
    this.aircraftCol = scene.primitives.add(new BillboardCollection({ scene }));
    this.quakeCol = scene.primitives.add(new PointPrimitiveCollection());
    this.webcamCol = scene.primitives.add(new BillboardCollection({ scene }));
    this.orbitLines = scene.primitives.add(new PolylineCollection());

    this.setupPicking();
  }

  /* ---------------- TLE records (pour copie dans le panneau info) ---------------- */
  private tleRecords: TleRecord[] = [];

  setTleRecords(recs: TleRecord[]) {
    this.tleRecords = recs;
  }

  /* ---------------- Surbrillance du satellite sélectionné ---------------- */
  private selectedSatIndex = -1;
  private readonly SEL_COLOR = Color.WHITE;
  private readonly SEL_SIZE = 7;

  private highlightSat(newIndex: number) {
    // Restaure l'ancien satellite sélectionné.
    if (this.selectedSatIndex >= 0 && this.satPoints[this.selectedSatIndex]) {
      const prev = this.satPoints[this.selectedSatIndex];
      prev.color = CLASS_COLOR[this.satMeta[this.selectedSatIndex]?.orbitClass ?? 'LEO'];
      prev.pixelSize = 2.6;
    }
    this.selectedSatIndex = newIndex;
    if (newIndex >= 0 && this.satPoints[newIndex]) {
      this.satPoints[newIndex].color = this.SEL_COLOR;
      this.satPoints[newIndex].pixelSize = this.SEL_SIZE;
    }
  }

  /* ---------------- Picking ---------------- */
  private setupPicking() {
    const handler = new ScreenSpaceEventHandler(this.viewer.scene.canvas);
    handler.setInputAction((movement: ScreenSpaceEventHandler.PositionedEvent) => {
      const picked = this.viewer.scene.pick(movement.position);
      if (!picked || !picked.id) {
        this.highlightSat(-1);
        this.onPick(null);
        return;
      }
      const id = picked.id as { kind: LayerId; index: number };
      if (id.kind === 'sats') {
        const meta = this.satMeta[id.index];
        if (meta) {
          this.highlightSat(id.index);
          const tle = this.tleRecords[id.index] ?? null;
          this.onPick({
            kind: 'sat',
            meta,
            state: this.getSatState(id.index),
            tle: tle ? { name: tle.name, l1: tle.l1, l2: tle.l2 } : null,
          });
        }
      } else if (id.kind === 'air') {
        this.onPick({ kind: 'air', data: this.aircraftData[id.index] });
      } else if (id.kind === 'sis') {
        this.onPick({ kind: 'sis', data: this.quakeData[id.index] });
      } else if (id.kind === 'cctv') {
        this.onPick({ kind: 'cctv', data: this.webcamData[id.index] });
      }
    }, ScreenSpaceEventType.LEFT_CLICK);
  }

  /** Expose la surbrillance aux sélections déclenchées hors picking (SearchBox). */
  highlightSatPublic(index: number) {
    this.highlightSat(index);
  }

  /** Retourne les lignes TLE brutes pour l'index donné. */
  getTle(index: number): { name: string; l1: string; l2: string } | null {
    const r = this.tleRecords[index];
    return r ? { name: r.name, l1: r.l1, l2: r.l2 } : null;
  }

  getSatState(index: number) {
    if (this.dead || !this.satPoints[index]) return { lat: 0, lon: 0, altKm: 0, speedKmS: 0 };
    const p = this.satPoints[index];
    const carto = this.viewer.scene.globe.ellipsoid.cartesianToCartographic(p.position);
    return {
      lat: CMath.toDegrees(carto.latitude),
      lon: CMath.toDegrees(carto.longitude),
      altKm: carto.height / 1000,
      speedKmS: this.satSpeed[index] ?? 0,
    };
  }

  /* ---------------- Satellites ---------------- */
  private satSpeed: number[] = [];
  // Sous-points courants (deg) pour le filtre de visibilité de la recherche.
  private satLon: Float32Array = new Float32Array(0);
  private satLat: Float32Array = new Float32Array(0);
  // Filtre par classe orbitale.
  private satClass: OrbitClass[] = [];
  private classEnabled: Record<OrbitClass, boolean> = {
    LEO: true, MEO: true, GEO: true, HEO: true, SSO: true,
  };
  // Masque de recherche dynamique (1 = correspond aux caractères tapés).
  private searchMask: Uint8Array | null = null;

  /** Un satellite est-il affichable (classe active ET match recherche) ? */
  private satAllowed(i: number): boolean {
    return (
      this.classEnabled[this.satClass[i]] &&
      (!this.searchMask || this.searchMask[i] === 1)
    );
  }

  /** Réapplique la visibilité (classe + recherche) à tous les points valides. */
  private applySatVisibility() {
    if (this.dead) return;
    for (let i = 0; i < this.satPoints.length; i++) {
      if (Number.isNaN(this.satLon[i])) continue;
      this.satPoints[i].show = this.satAllowed(i);
    }
  }

  /** Active/désactive l'affichage des satellites par classe orbitale. */
  setClassFilter(enabled: Record<OrbitClass, boolean>) {
    this.classEnabled = enabled;
    this.applySatVisibility();
  }

  /**
   * Filtre dynamique : seuls les satellites dont le nom/NORAD contient les
   * caractères tapés restent visibles sur la carte. Vide → tout réapparaît.
   */
  setSearchFilter(query: string) {
    const q = query.trim().toLowerCase();
    if (!q) {
      this.searchMask = null;
    } else {
      const mask = new Uint8Array(this.satMeta.length);
      for (let i = 0; i < this.satMeta.length; i++) {
        const m = this.satMeta[i];
        mask[i] =
          m.name.toLowerCase().includes(q) || m.noradId.includes(q) ? 1 : 0;
      }
      this.searchMask = mask;
    }
    this.applySatVisibility();
  }

  setSatMeta(meta: SatMeta[]) {
    if (this.dead) return;
    this.satMeta = meta;
    this.satClass = meta.map((m) => m.orbitClass);
    this.satCollection.removeAll();
    this.satPoints = [];
    for (let i = 0; i < meta.length; i++) {
      const point = this.satCollection.add({
        position: Cartesian3.fromDegrees(0, 0, 0),
        pixelSize: 2.6,
        color: CLASS_COLOR[meta[i].orbitClass],
        scaleByDistance: new NearFarScalar(1.5e7, 1.4, 4e7, 0.7),
        id: { kind: 'sats', index: i },
        show: false,
      });
      this.satPoints.push(point);
    }
    this.satSpeed = new Array(meta.length).fill(0);
    this.satLon = new Float32Array(meta.length).fill(NaN);
    this.satLat = new Float32Array(meta.length).fill(NaN);
  }

  /** Mise à jour GPU par référence depuis le buffer du worker [lon,lat,alt(m)]. */
  updateSatPositions(buffer: ArrayBuffer, count: number) {
    if (this.dead) return;
    const arr = new Float32Array(buffer);
    const n = Math.min(count, this.satPoints.length);
    for (let i = 0; i < n; i++) {
      const lon = arr[i * 4];
      const point = this.satPoints[i];
      if (Number.isNaN(lon)) {
        point.show = false;
        this.satLon[i] = NaN;
        continue;
      }
      const lat = arr[i * 4 + 1];
      const alt = arr[i * 4 + 2];
      this.satSpeed[i] = arr[i * 4 + 3];
      this.satLon[i] = lon;
      this.satLat[i] = lat;
      point.position = Cartesian3.fromDegrees(lon, lat, alt, undefined, this.scratch);
      point.show = this.satAllowed(i);
    }
  }

  setSatVisible(v: boolean) {
    this.satCollection.show = v;
    if (!v) this.clearOrbit();
  }

  /* ---------------- Trajectoire orbitale ---------------- */
  showOrbit(points: number[]) {
    if (this.dead) return;
    this.clearOrbit();
    const positions = Cartesian3.fromDegreesArrayHeights(points);
    this.orbit = this.orbitLines.add({
      positions,
      width: 1.6,
      material: Material.fromType('Color', {
        color: Color.fromCssColorString('#10ffa0').withAlpha(0.85),
      }),
    });
  }

  clearOrbit() {
    if (this.orbit) {
      this.orbitLines.remove(this.orbit);
      this.orbit = null;
    }
  }

  focusSatellite(index: number) {
    if (this.dead) return;
    const p = this.satPoints[index];
    if (!p) return;
    this.viewer.camera.flyToBoundingSphere(
      { center: p.position, radius: 2_500_000 } as any,
      { duration: 1.4, offset: new HeadingPitchRange(0, -0.5, 6_000_000) },
    );
  }

  /* ---------------- Trafic aérien ---------------- */
  setAircraft(list: Aircraft[]) {
    if (this.dead) return;
    this.aircraftData = list;
    this.aircraftCol.removeAll();
    list.forEach((a, i) => {
      this.aircraftCol.add({
        position: Cartesian3.fromDegrees(a.lon, a.lat, (a.geoAlt ?? a.baroAlt ?? 0) || 0),
        image: PLANE_ICON,
        scale: 0.6,
        // Icônes plus petites de loin, plus grandes de près.
        scaleByDistance: new NearFarScalar(5e5, 0.6, 2.5e7, 0.12),
        // L'icône pointe vers le nord ; rotation horaire = -cap (sens trigo).
        rotation: CMath.toRadians(-(a.heading ?? 0)),
        alignedAxis: Cartesian3.ZERO, // rotation en espace écran
        color: Color.WHITE,
        id: { kind: 'air', index: i },
      });
    });
  }

  setAircraftVisible(v: boolean) {
    this.aircraftCol.show = v;
  }

  /** Bounding box du cône de vision caméra actuel (pour /api/aircraft). */
  getViewBbox(): { lamin: number; lomin: number; lamax: number; lomax: number } | null {
    if (this.dead) return null;
    const rect = this.viewer.camera.computeViewRectangle();
    if (!rect) return null;
    return {
      lamin: CMath.toDegrees(rect.south),
      lomin: CMath.toDegrees(rect.west),
      lamax: CMath.toDegrees(rect.north),
      lomax: CMath.toDegrees(rect.east),
    };
  }

  /**
   * Renvoie un prédicat indiquant si le sous-point d'un satellite est dans
   * le rectangle de vue caméra courant (pour filtrer la recherche sur ce qui
   * est visible). Globe entier visible / indéterminé → tout est « visible ».
   */
  getVisibleSatFilter(): (index: number) => boolean {
    if (this.dead) return () => true;
    const rect = this.viewer.camera.computeViewRectangle();
    if (!rect) return () => true;
    const west = CMath.toDegrees(rect.west);
    const east = CMath.toDegrees(rect.east);
    const south = CMath.toDegrees(rect.south);
    const north = CMath.toDegrees(rect.north);
    const crossesAntimeridian = west > east;
    const lon = this.satLon;
    const lat = this.satLat;
    return (i: number) => {
      const la = lat[i];
      const lo = lon[i];
      if (Number.isNaN(lo)) return false;
      if (la < south || la > north) return false;
      return crossesAntimeridian ? lo >= west || lo <= east : lo >= west && lo <= east;
    };
  }

  /* ---------------- Sismes ---------------- */
  setEarthquakes(list: Earthquake[]) {
    if (this.dead) return;
    this.quakeData = list;
    this.quakeCol.removeAll();
    list.forEach((q, i) => {
      const mag = q.mag ?? 0;
      const color =
        mag >= 6 ? Color.fromCssColorString('#ff4d5e')
        : mag >= 4.5 ? Color.fromCssColorString('#ffb347')
        : Color.fromCssColorString('#fff04d');
      this.quakeCol.add({
        position: Cartesian3.fromDegrees(q.lon, q.lat, 0),
        pixelSize: Math.max(6, mag * 3.2),
        color: color.withAlpha(0.85),
        outlineColor: color,
        outlineWidth: 1,
        id: { kind: 'sis', index: i },
      });
    });
  }

  setEarthquakesVisible(v: boolean) {
    this.quakeCol.show = v;
  }

  /* ---------------- Webcams / CCTV ---------------- */
  setWebcams(list: Webcam[]) {
    if (this.dead) return;
    this.webcamData = list;
    this.webcamCol.removeAll();
    list.forEach((w, i) => {
      this.webcamCol.add({
        position: Cartesian3.fromDegrees(w.lon, w.lat, 0),
        image: CAMERA_ICON,
        scale: 0.5,
        // Petites de loin (clusters lisibles), plus grandes une fois zoomé.
        scaleByDistance: new NearFarScalar(3e5, 0.5, 6e6, 0.1),
        color: Color.WHITE,
        id: { kind: 'cctv', index: i },
      });
    });
  }

  setWebcamsVisible(v: boolean) {
    this.webcamCol.show = v;
  }

  /* ---------------- Caméra ---------------- */
  flyTo(lon: number, lat: number, height: number) {
    if (this.dead) return;
    this.viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(lon, lat, height),
      duration: 1.2,
    });
  }

  flyToRectangle(west: number, south: number, east: number, north: number) {
    this.viewer.camera.flyTo({
      destination: Rectangle.fromDegrees(west, south, east, north),
      duration: 1.2,
    });
  }

  /* ---------------- Mode rendu / NVG ---------------- */
  setRenderMode(mode: 'normal' | 'nvg') {
    if (this.dead) return;
    const stages = this.viewer.scene.postProcessStages;
    if (mode === 'nvg') {
      if (!this.nvgStage) {
        this.nvgStage = new PostProcessStage({ fragmentShader: NVG_SHADER });
        stages.add(this.nvgStage);
      }
      this.nvgStage.enabled = true;
    } else if (this.nvgStage) {
      this.nvgStage.enabled = false;
    }
  }

  destroy() {
    this.destroyed = true;
    if (this.viewer && !this.viewer.isDestroyed()) this.viewer.destroy();
  }
}
