import { useEffect, useState } from 'react';
import { useStore } from '../store/useStore';
import { audio } from '../services/audioService';

function Clock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="text-hud-emerald tabular-nums">
      {now.toISOString().slice(11, 19)} UTC
    </span>
  );
}

export default function Hud() {
  const muted = useStore((s) => s.muted);
  const setMuted = useStore((s) => s.setMuted);
  const counts = useStore((s) => s.counts);

  return (
    <div className="absolute top-3 left-3 right-3 z-20 flex items-center justify-between gap-3 px-4 py-2 hud-panel">
      <div className="flex items-center gap-3">
        <span className="text-base font-bold tracking-[0.3em] text-hud-emerald glow-text">
          ▰ PANOPTICON
        </span>
        <span className="hidden md:inline text-[10px] text-hud-emerald/50 tracking-widest">
          SURVEILLANCE GÉOSPATIALE 3D
        </span>
      </div>

      <div className="flex items-center gap-4 text-[10px] tracking-widest">
        <span className="hidden lg:flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-hud-emerald animate-pulse" />
          {counts.sats.toLocaleString('fr-FR')} OBJ
        </span>
        <Clock />

        {/* Audio */}
        <button
          onClick={() => {
            const m = !muted;
            setMuted(m);
            audio.setMuted(m);
          }}
          className="text-hud-emerald/70 hover:text-hud-emerald"
          title="Audio [M]"
        >
          {muted ? '🔇' : '🔊'}
        </button>
      </div>
    </div>
  );
}
