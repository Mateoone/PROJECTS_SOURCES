import { useMemo } from 'react';
import { useStore } from './store/useStore';
import { evaluateScenario } from './core/scenario';
import Globe from './components/Globe';
import ControlPanel from './components/ControlPanel';
import Readout from './components/Readout';
import TimeBar from './components/TimeBar';

export default function App() {
  const cfg = useStore((s) => s.cfg);

  // Recalcule l'ensemble du scénario à chaque changement de config (pur).
  const res = useMemo(() => evaluateScenario(cfg), [cfg]);

  return (
    <div className="app">
      <div className="globe-wrap">
        <Globe res={res} />
        <TimeBar />
      </div>
      <div className="sidebar">
        <h1 className="title">SatCov Planner</h1>
        <p className="subtitle">Couverture satellite · link budget visuel · ITU-R pluie</p>
        <Readout res={res} />
        <ControlPanel />
      </div>
    </div>
  );
}
