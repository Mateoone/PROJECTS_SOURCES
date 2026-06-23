import { useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';

const LEVEL_COLOR: Record<string, string> = {
  info: 'text-hud-sky',
  ok: 'text-hud-emerald',
  warn: 'text-hud-amber',
  alert: 'text-hud-danger',
};

function clock(ts: number) {
  const d = new Date(ts);
  return d.toTimeString().slice(0, 8);
}

export default function LogTerminal() {
  const logs = useStore((s) => s.logs);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [logs]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="hud-label mb-1 flex justify-between">
        <span>TÉLÉMÉTRIE RÉSEAU</span>
        <span className="text-hud-emerald/40">{logs.length} LIGNES</span>
      </div>
      <div
        ref={ref}
        className="flex-1 min-h-0 overflow-y-auto text-[10px] leading-relaxed bg-black/40 border border-hud-emerald/20 rounded-sm p-2 font-mono"
      >
        {logs.length === 0 && (
          <div className="text-hud-emerald/30">// EN ATTENTE DE FLUX...</div>
        )}
        {logs.map((l) => (
          <div key={l.id} className="flex gap-2">
            <span className="text-hud-emerald/30 shrink-0">{clock(l.ts)}</span>
            <span className={`${LEVEL_COLOR[l.level]} truncate`}>{l.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
