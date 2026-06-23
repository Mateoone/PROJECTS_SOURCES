import { useEffect } from 'react';
import { useStore } from '../store/useStore';
import { audio } from '../services/audioService';
import type { LayerId } from '../types';

const KEY_LAYER: Record<string, LayerId> = {
  '1': 'sats',
  '2': 'air',
  '3': 'sis',
  '4': 'cctv',
};

/** Raccourcis clavier d'urgence : 1-4 calques, M = mute. */
export function useKeyboard() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ignore la saisie dans les champs texte.
      if (e.target instanceof HTMLInputElement) return;
      const { toggleLayer, muted, setMuted } = useStore.getState();

      if (KEY_LAYER[e.key]) {
        toggleLayer(KEY_LAYER[e.key]);
        audio.toggle();
      } else if (e.key.toLowerCase() === 'm') {
        const m = !muted;
        setMuted(m);
        audio.setMuted(m);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
