import { useState } from 'react';
import { useStore } from '../store/useStore';
import { audio } from '../services/audioService';
import type { LayerId, OrbitClass } from '../types';
import SearchBox from './SearchBox';
import LogTerminal from './LogTerminal';

const ORBIT_CLASSES: { id: OrbitClass; color: string; label: string }[] = [
  { id: 'LEO', color: '#10ffa0', label: 'LEO' },
  { id: 'SSO', color: '#c77dff', label: 'SSO' },
  { id: 'MEO', color: '#5fd2ff', label: 'MEO' },
  { id: 'GEO', color: '#ffb347', label: 'GEO' },
  { id: 'HEO', color: '#fff04d', label: 'HEO' },
];

const LAYERS: { id: LayerId; key: string; label: string; color: string }[] = [
  { id: 'sats', key: '1', label: 'SATELLITES', color: 'emerald' },
  { id: 'air', key: '2', label: 'TRAFIC AÉRIEN', color: 'sky' },
  { id: 'sis', key: '3', label: 'SISMES', color: 'amber' },
  { id: 'cctv', key: '4', label: 'CAMÉRAS CCTV', color: 'yellow' },
];

const COLOR_MAP: Record<string, { on: string; text: string }> = {
  emerald: { on: 'bg-hud-emerald/15 border-hud-emerald text-hud-emerald shadow-glow', text: 'text-hud-emerald' },
  sky: { on: 'bg-hud-sky/15 border-hud-sky text-hud-sky', text: 'text-hud-sky' },
  amber: { on: 'bg-hud-amber/15 border-hud-amber text-hud-amber shadow-glow-amber', text: 'text-hud-amber' },
  yellow: { on: 'bg-hud-yellow/15 border-hud-yellow text-hud-yellow', text: 'text-hud-yellow' },
};

export default function ControlCenter() {
  const [open, setOpen] = useState(true);
  const layers = useStore((s) => s.layers);
  const counts = useStore((s) => s.counts);
  const toggleLayer = useStore((s) => s.toggleLayer);
  const classFilter = useStore((s) => s.classFilter);
  const toggleClass = useStore((s) => s.toggleClass);

  return (
    <div
      className={`absolute left-3 top-16 bottom-3 z-20 flex transition-all duration-300 ${
        open ? 'w-80' : 'w-10'
      }`}
    >
      <div className="hud-panel flex-1 flex flex-col overflow-hidden">
        {/* En-tête */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-hud-emerald/20">
          {open && (
            <span className="text-xs tracking-[0.25em] text-hud-emerald glow-text">
              ▣ CENTRE DE CONTRÔLE
            </span>
          )}
          <button
            onClick={() => {
              setOpen((o) => !o);
              audio.blip();
            }}
            className="text-hud-emerald/70 hover:text-hud-emerald text-sm"
            title={open ? 'Réduire' : 'Déployer'}
          >
            {open ? '◀' : '▶'}
          </button>
        </div>

        {open && (
          <div className="flex flex-col flex-1 min-h-0 p-3 gap-3">
            {/* Calques tactiques */}
            <div>
              <div className="hud-label mb-2">CALQUES TACTIQUES</div>
              <div className="grid grid-cols-2 gap-2">
                {LAYERS.map((l) => {
                  const active = layers[l.id];
                  const cm = COLOR_MAP[l.color];
                  return (
                    <button
                      key={l.id}
                      onClick={() => {
                        toggleLayer(l.id);
                        audio.toggle();
                      }}
                      className={`hud-btn relative text-left ${
                        active
                          ? cm.on
                          : 'border-hud-emerald/20 text-hud-emerald/40 hover:border-hud-emerald/40'
                      }`}
                    >
                      <span className="absolute top-1 right-1.5 text-[9px] opacity-50">
                        [{l.key}]
                      </span>
                      <div className="text-[10px] leading-tight">{l.label}</div>
                      <div className={`text-[11px] font-bold ${active ? cm.text : ''}`}>
                        {counts[l.id].toLocaleString('fr-FR')}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Filtre classes orbitales (visible quand la couche SATS est active) */}
            {layers.sats && (
              <div>
                <div className="hud-label mb-2">CLASSES ORBITALES</div>
                <div className="flex flex-wrap gap-1.5">
                  {ORBIT_CLASSES.map((c) => {
                    const on = classFilter[c.id];
                    return (
                      <button
                        key={c.id}
                        onClick={() => {
                          toggleClass(c.id);
                          audio.blip();
                        }}
                        className="px-2 py-1 text-[10px] tracking-widest rounded-sm border transition-all flex items-center gap-1.5"
                        style={{
                          borderColor: on ? c.color : 'rgba(16,255,160,0.2)',
                          color: on ? c.color : 'rgba(16,255,160,0.35)',
                          background: on ? `${c.color}1a` : 'transparent',
                          boxShadow: on ? `0 0 8px ${c.color}55` : 'none',
                        }}
                      >
                        <span
                          className="inline-block h-2 w-2 rounded-full"
                          style={{ background: on ? c.color : 'transparent', border: `1px solid ${c.color}` }}
                        />
                        {c.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Recherche */}
            <div>
              <div className="hud-label mb-1">ACQUISITION DE CIBLE</div>
              <SearchBox />
            </div>

            {/* Terminal de log */}
            <div className="flex-1 min-h-0">
              <LogTerminal />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
