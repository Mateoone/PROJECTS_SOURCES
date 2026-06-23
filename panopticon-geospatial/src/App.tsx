import { useEffect } from 'react';
import Globe from './components/Globe';
import Hud from './components/Hud';
import ControlCenter from './components/ControlCenter';
import DetailPanel from './components/DetailPanel';
import LoadingOverlay from './components/LoadingOverlay';
import { useKeyboard } from './hooks/useKeyboard';
import { audio } from './services/audioService';

export default function App() {
  useKeyboard();

  // Débloque l'audio à la première interaction (politique autoplay navigateur).
  useEffect(() => {
    const unlock = () => audio.unlock();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <Globe />
      <Hud />
      <ControlCenter />
      <DetailPanel />

      {/* Cadres d'angle décoratifs HUD */}
      <div className="pointer-events-none absolute inset-3 z-10">
        <div className="corner top-0 left-0 border-l-2 border-t-2" />
        <div className="corner top-0 right-0 border-r-2 border-t-2" />
        <div className="corner bottom-0 left-0 border-l-2 border-b-2" />
        <div className="corner bottom-0 right-0 border-r-2 border-b-2" />
      </div>

      {/* Effets écran globaux */}
      <div className="crt-overlay" />
      <div className="vignette" />

      <LoadingOverlay />
    </div>
  );
}
