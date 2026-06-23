import { useStore } from '../store/useStore';

export default function LoadingOverlay() {
  const loading = useStore((s) => s.loading);
  if (!loading) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-hud-bg/90 backdrop-blur-sm">
      <div className="text-2xl font-bold tracking-[0.4em] text-hud-emerald glow-text mb-6 animate-flicker">
        ▰ PANOPTICON
      </div>
      <div className="w-72 h-1 bg-hud-emerald/10 rounded overflow-hidden mb-3">
        <div className="h-full w-1/3 bg-hud-emerald animate-scan shadow-glow" />
      </div>
      <div className="text-[11px] tracking-[0.25em] text-hud-emerald/70">
        {loading}<span className="animate-pulse">_</span>
      </div>
      <div className="mt-8 text-[9px] text-hud-emerald/30 tracking-widest max-w-md text-center px-6">
        SGP4 ORBITAL PROPAGATION · CELESTRAK TLE · USGS · OPENSKY · CESIUMJS
      </div>
    </div>
  );
}
