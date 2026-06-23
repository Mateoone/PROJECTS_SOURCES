import { useEffect, useRef } from 'react';
import { GlobeController } from '../services/cesiumService';
import { useStore } from '../store/useStore';
import { audio } from '../services/audioService';
import {
  fetchTle,
  fetchAircraft,
  fetchEarthquakes,
  fetchWebcams,
} from '../services/api';
import { globeApi } from '../services/globeApi';
import type { WorkerOutbound, Selection } from '../types';

export default function Globe() {
  const containerRef = useRef<HTMLDivElement>(null);
  const ctrlRef = useRef<GlobeController | null>(null);
  const workerRef = useRef<Worker | null>(null);

  // Sélecteurs réactifs.
  const layers = useStore((s) => s.layers);
  const classFilter = useStore((s) => s.classFilter);
  const search = useStore((s) => s.search);
  const renderMode = useStore((s) => s.renderMode);

  /* ---- Initialisation unique du globe + worker ---- */
  useEffect(() => {
    if (!containerRef.current) return;
    const ctrl = new GlobeController();
    ctrlRef.current = ctrl;

    const onPick = (sel: Selection) => {
      const { setSelection, log } = useStore.getState();
      setSelection(sel);
      if (!sel) {
        ctrl.clearOrbit();
        return;
      }
      audio.select();
      // NB : la caméra ne bouge PAS au clic — uniquement via les boutons
      // « alignement caméra » du panneau de détails.
      if (sel.kind === 'sat') {
        // Trace la trajectoire des dernières 24 h (sans déplacer la caméra).
        workerRef.current?.postMessage({ type: 'orbit', index: sel.meta.index });
        log(`CIBLE ACQUISE :: ${sel.meta.name} [${sel.meta.noradId}]`, 'ok');
      } else if (sel.kind === 'sis') {
        const major = sel.data.mag >= 6;
        log(`SISME M${sel.data.mag?.toFixed(1)} :: ${sel.data.place}`, major ? 'alert' : 'warn');
        if (major) audio.alarm();
      } else if (sel.kind === 'air') {
        log(`VOL ${sel.data.callsign || sel.data.icao24} :: ${sel.data.origin}`, 'info');
      } else if (sel.kind === 'cctv') {
        log(`FLUX CCTV :: ${sel.data.title}`, 'info');
      }
    };

    ctrl.init(containerRef.current, onPick);

    // Expose l'API impérative aux autres composants (recherche, détails).
    globeApi.selectSat = (index) => {
      const meta = useStore.getState().satMeta[index];
      if (meta) {
        ctrl.highlightSatPublic(index);
        onPick({ kind: 'sat', meta, state: ctrl.getSatState(index), tle: ctrl.getTle(index) });
      }
    };
    globeApi.focusSat = (index) => ctrl.focusSatellite(index);
    globeApi.getSatState = (index) =>
      index < useStore.getState().satMeta.length ? ctrl.getSatState(index) : null;
    globeApi.getVisibleSatFilter = () => ctrl.getVisibleSatFilter();

    // Notifie l'UI (recherche) quand la zone visible change.
    ctrl.viewer.camera.moveEnd.addEventListener(() =>
      window.dispatchEvent(new Event('panopticon:viewchange')),
    );

    // Handle de debug (DEV uniquement).
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__pano = { ctrl, globeApi, store: useStore };
    }
    globeApi.flyTo = (lon, lat, height) => ctrl.flyTo(lon, lat, height);

    // Web Worker de propagation orbitale.
    const worker = new Worker(
      new URL('../workers/satellite.worker.ts', import.meta.url),
      { type: 'module' },
    );
    workerRef.current = worker;

    worker.onmessage = (e: MessageEvent<WorkerOutbound>) => {
      const msg = e.data;
      const { setSatMeta, setCount, setLoading, log } = useStore.getState();
      if (msg.type === 'ready') {
        ctrl.setSatMeta(msg.meta);
        setSatMeta(msg.meta);
        setCount('sats', msg.meta.length);
        setLoading(null);
        log(`PROPAGATION SGP4 ACTIVE :: ${msg.meta.length} OBJETS ORBITAUX`, 'ok');
        audio.boot();
      } else if (msg.type === 'positions') {
        ctrl.updateSatPositions(msg.buffer, msg.count);
      } else if (msg.type === 'orbit') {
        ctrl.showOrbit(msg.points);
      }
    };

    // Récupération des TLE puis amorçage du worker.
    const { log, setLoading } = useStore.getState();
    log('ACQUISITION TLE CELESTRAK (22 GROUPES)...', 'info');
    setLoading('ACQUISITION DES ÉPHÉMÉRIDES TLE');
    fetchTle()
      .then((res) => {
        log(`TLE REÇUS :: ${res.count} OBJETS / ${res.okGroups} GROUPES`, 'ok');
        setLoading('PROPAGATION ORBITALE SGP4');
        ctrl.setTleRecords(res.sats);
        worker.postMessage({ type: 'init', tle: res.sats });
      })
      .catch((err) => {
        log(`ÉCHEC TLE :: ${err.message}`, 'alert');
        setLoading(null);
      });

    return () => {
      worker.terminate();
      ctrl.destroy();
    };
  }, []);

  /* ---- Visibilité des couches ---- */
  useEffect(() => {
    ctrlRef.current?.setSatVisible(layers.sats);
  }, [layers.sats]);
  useEffect(() => {
    ctrlRef.current?.setClassFilter(classFilter);
  }, [classFilter]);
  // Filtre dynamique de la carte selon les caractères tapés.
  useEffect(() => {
    ctrlRef.current?.setSearchFilter(search);
  }, [search]);
  useEffect(() => {
    ctrlRef.current?.setAircraftVisible(layers.air);
  }, [layers.air]);
  useEffect(() => {
    ctrlRef.current?.setEarthquakesVisible(layers.sis);
  }, [layers.sis]);
  useEffect(() => {
    ctrlRef.current?.setWebcamsVisible(layers.cctv);
  }, [layers.cctv]);

  /* ---- Mode de rendu / NVG ---- */
  useEffect(() => {
    ctrlRef.current?.setRenderMode(renderMode);
  }, [renderMode]);

  /* ---- Couche AIR : interrogation cadencée sur le cône caméra ---- */
  useEffect(() => {
    if (!layers.air) return;
    let alive = true;
    const poll = async () => {
      const ctrl = ctrlRef.current;
      if (!ctrl) return;
      const bbox = ctrl.getViewBbox() ?? undefined;
      try {
        const res = await fetchAircraft(bbox);
        if (!alive) return;
        ctrl.setAircraft(res.states);
        useStore.getState().setCount('air', res.count);
        if (res.stale)
          useStore.getState().log('OPENSKY :: CACHE DIFFÉRÉ (quota)', 'warn');
        else if (res.degraded)
          useStore.getState().log('OPENSKY INDISPONIBLE', 'warn');
      } catch {
        /* repli silencieux */
      }
    };
    poll();
    // Sondage espacé (30 s) pour ménager le quota OpenSky anonyme.
    const id = setInterval(poll, 30_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [layers.air]);

  /* ---- Couche SIS : sismes USGS de l'heure ---- */
  useEffect(() => {
    if (!layers.sis) return;
    let alive = true;
    const poll = async () => {
      try {
        const res = await fetchEarthquakes();
        if (!alive) return;
        ctrlRef.current?.setEarthquakes(res.quakes);
        useStore.getState().setCount('sis', res.count);
        const major = res.quakes.filter((q) => q.mag >= 6).length;
        if (major)
          useStore.getState().log(`${major} SISME(S) MAJEUR(S) DÉTECTÉ(S)`, 'alert');
      } catch {
        /* repli silencieux */
      }
    };
    poll();
    const id = setInterval(poll, 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [layers.sis]);

  /* ---- Couche CCTV : webcams à proximité de la vue (réactif) ---- */
  useEffect(() => {
    if (!layers.cctv) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      const ctrl = ctrlRef.current;
      if (!ctrl) return;
      const bbox = ctrl.getViewBbox();
      let center: { lat: number; lon: number; radius: number } | undefined;
      if (bbox) {
        const spanDeg = Math.max(bbox.lamax - bbox.lamin, bbox.lomax - bbox.lomin);
        const approxKm = (spanDeg * 111) / 2;
        // Vue resserrée → webcams locales ; vue large → top mondial.
        if (approxKm < 800) {
          center = {
            lat: (bbox.lamin + bbox.lamax) / 2,
            lon: (bbox.lomin + bbox.lomax) / 2,
            radius: Math.min(Math.max(Math.round(approxKm), 50), 250),
          };
        }
      }
      try {
        const res = await fetchWebcams(center);
        if (!alive) return;
        ctrl.setWebcams(res.webcams);
        useStore.getState().setCount('cctv', res.count);
        useStore.getState().log(`CCTV :: ${res.count} FLUX (${res.source})`, 'info');
      } catch {
        /* repli silencieux */
      }
    };
    const onView = () => {
      clearTimeout(timer);
      timer = setTimeout(load, 1200); // debounce sur déplacement caméra
    };
    load();
    window.addEventListener('panopticon:viewchange', onView);
    return () => {
      alive = false;
      clearTimeout(timer);
      window.removeEventListener('panopticon:viewchange', onView);
    };
  }, [layers.cctv]);

  return <div ref={containerRef} className="absolute inset-0" />;
}
