import { useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import { orbitalPeriodSec } from '../core/orbit';

/** Barre temporelle : lecture/pause + slider sur une fenêtre de propagation. */
export default function TimeBar() {
  const cfg = useStore((s) => s.cfg);
  const playback = useStore((s) => s.playback);
  const setPlayback = useStore((s) => s.setPlayback);
  const setTime = useStore((s) => s.setTime);
  const raf = useRef<number>(0);
  const last = useRef<number>(0);

  // Fenêtre : une période orbitale (GEO → 24 h).
  const windowSec = cfg.orbitClass === 'GEO' ? 86400 : orbitalPeriodSec(cfg.keplerian.altitudeKm);
  const t0 = cfg.epoch;
  const frac = Math.min(1, Math.max(0, (cfg.time - t0) / (windowSec * 1000)));

  useEffect(() => {
    if (!playback.playing) return;
    last.current = performance.now();
    const tick = (now: number) => {
      const dt = (now - last.current) / 1000;
      last.current = now;
      const cur = useStore.getState().cfg.time;
      let next = cur + dt * playback.speed * 1000;
      if (next > t0 + windowSec * 1000) next = t0;
      setTime(next);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [playback.playing, playback.speed, t0, windowSec, setTime]);

  const clock = new Date(cfg.time).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

  return (
    <div className="timebar">
      <button onClick={() => setPlayback({ playing: !playback.playing })}>
        {playback.playing ? '❚❚' : '▶'}
      </button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.001}
        value={frac}
        onChange={(e) => setTime(t0 + parseFloat(e.target.value) * windowSec * 1000)}
      />
      <span className="clock">{clock}</span>
      <select
        value={playback.speed}
        onChange={(e) => setPlayback({ speed: Number(e.target.value) })}
        style={{ width: 80 }}
      >
        <option value={1}>×1</option>
        <option value={60}>×60</option>
        <option value={300}>×300</option>
        <option value={1800}>×1800</option>
      </select>
    </div>
  );
}
