import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store/useStore';
import { globeApi } from '../services/globeApi';
import { audio } from '../services/audioService';

export default function SearchBox() {
  const search = useStore((s) => s.search);
  const setSearch = useStore((s) => s.setSearch);
  const satMeta = useStore((s) => s.satMeta);
  // Bump à chaque changement de zone visible pour réévaluer le filtre.
  const [viewTick, setViewTick] = useState(0);

  useEffect(() => {
    const onView = () => setViewTick((t) => t + 1);
    window.addEventListener('panopticon:viewchange', onView);
    return () => window.removeEventListener('panopticon:viewchange', onView);
  }, []);

  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length < 2) return [];
    // Filtre nom/ID PUIS restriction à ce qui est visible sur la carte.
    const isVisible = globeApi.getVisibleSatFilter();
    const out = [];
    for (const m of satMeta) {
      if (!m.name.toLowerCase().includes(q) && !m.noradId.includes(q)) continue;
      if (!isVisible(m.index)) continue;
      out.push(m);
      if (out.length >= 12) break;
    }
    return out;
    // viewTick force la réévaluation quand la caméra bouge.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, satMeta, viewTick]);

  return (
    <div className="relative">
      <div className="flex items-center gap-2 px-2 py-1.5 border border-hud-emerald/30 rounded-sm bg-black/40">
        <span className="text-hud-emerald/60 text-xs">⌖</span>
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            audio.blip();
          }}
          placeholder="RECHERCHE SAT // ZONE VISIBLE"
          className="flex-1 bg-transparent outline-none text-xs text-hud-emerald placeholder:text-hud-emerald/30 tracking-wider"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="text-hud-emerald/50 hover:text-hud-danger text-xs"
          >
            ✕
          </button>
        )}
      </div>

      {search.trim().length >= 2 && (
        <div className="absolute z-30 mt-1 w-full max-h-60 overflow-y-auto hud-panel">
          {results.length === 0 ? (
            <div className="px-3 py-2 text-[10px] text-hud-amber/70">
              AUCUNE CIBLE DANS LA ZONE VISIBLE
            </div>
          ) : (
            results.map((m) => (
              <button
                key={m.noradId}
                onClick={() => {
                  globeApi.selectSat(m.index);
                  setSearch('');
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-hud-emerald/10 border-b border-hud-emerald/10 last:border-0"
              >
                <div className="text-xs text-hud-emerald truncate">{m.name}</div>
                <div className="text-[10px] text-hud-emerald/50 flex justify-between">
                  <span>NORAD {m.noradId}</span>
                  <span className="text-hud-amber">{m.orbitClass}</span>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
