import { create } from 'zustand';
import type { LayerId, OrbitClass, RenderMode, Selection, SatMeta } from '../types';

export interface LogEntry {
  id: number;
  ts: number;
  level: 'info' | 'warn' | 'ok' | 'alert';
  text: string;
}

interface HudState {
  layers: Record<LayerId, boolean>;
  classFilter: Record<OrbitClass, boolean>;
  renderMode: RenderMode;
  selection: Selection;
  search: string;
  muted: boolean;
  loading: string | null; // message de chargement / null si prêt
  // Compteurs télémétriques
  counts: Record<LayerId, number>;
  satMeta: SatMeta[];
  logs: LogEntry[];
  // actions
  toggleLayer: (id: LayerId) => void;
  toggleClass: (c: OrbitClass) => void;
  setRenderMode: (m: RenderMode) => void;
  setSelection: (s: Selection) => void;
  setSearch: (q: string) => void;
  setMuted: (m: boolean) => void;
  setLoading: (m: string | null) => void;
  setCount: (id: LayerId, n: number) => void;
  setSatMeta: (m: SatMeta[]) => void;
  log: (text: string, level?: LogEntry['level']) => void;
}

let logId = 0;

export const useStore = create<HudState>((set) => ({
  layers: { sats: true, air: false, sis: true, cctv: false },
  classFilter: { LEO: true, MEO: true, GEO: true, HEO: true, SSO: true },
  renderMode: 'normal',
  selection: null,
  search: '',
  muted: false,
  loading: 'INITIALISATION DU SYSTÈME',
  counts: { sats: 0, air: 0, sis: 0, cctv: 0 },
  satMeta: [],
  logs: [],

  toggleLayer: (id) =>
    set((s) => ({ layers: { ...s.layers, [id]: !s.layers[id] } })),
  toggleClass: (c) =>
    set((s) => ({ classFilter: { ...s.classFilter, [c]: !s.classFilter[c] } })),
  setRenderMode: (renderMode) => set({ renderMode }),
  setSelection: (selection) => set({ selection }),
  setSearch: (search) => set({ search }),
  setMuted: (muted) => set({ muted }),
  setLoading: (loading) => set({ loading }),
  setCount: (id, n) => set((s) => ({ counts: { ...s.counts, [id]: n } })),
  setSatMeta: (satMeta) => set({ satMeta }),
  log: (text, level = 'info') =>
    set((s) => ({
      logs: [
        ...s.logs.slice(-120),
        { id: logId++, ts: Date.now(), level, text },
      ],
    })),
}));
