import { useEffect, useRef } from 'react';
import { GlobeController } from '../cesium/GlobeController';
import type { ScenarioResult } from '../core/scenario';
import { useStore } from '../store/useStore';

export default function Globe({ res }: { res: ScenarioResult }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const ctrlRef = useRef<GlobeController | null>(null);
  const layers = useStore((s) => s.layers);
  const didFocus = useRef(false);

  // Init unique.
  useEffect(() => {
    if (!containerRef.current) return;
    const ctrl = new GlobeController();
    ctrl.init(containerRef.current);
    ctrlRef.current = ctrl;
    return () => ctrl.destroy();
  }, []);

  // Mise à jour du rendu à chaque changement de résultat / couches.
  useEffect(() => {
    const ctrl = ctrlRef.current;
    if (!ctrl) return;
    ctrl.update(res, layers);
    if (!didFocus.current) {
      // Cadre sur le point de visée (nadir ou steeré).
      ctrl.focus(res.aimLatDeg, res.aimLonDeg, res.orbit.altitudeKm);
      didFocus.current = true;
    }
  }, [res, layers]);

  // Conteneur en position absolue : sa taille ne dépend PAS du canvas Cesium,
  // ce qui évite la boucle de redimensionnement (canvas qui grandit sans fin).
  return <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />;
}
