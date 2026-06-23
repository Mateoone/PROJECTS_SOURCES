import { useEffect, useState } from 'react';
import { fetchAircraftPhoto } from '../services/api';
import TelemetryFeed from './TelemetryFeed';

interface Photo {
  thumbnail: string;
  link: string;
  photographer: string;
}

/** Photo réelle de l'appareil (Planespotters, par adresse ICAO24). */
export default function AircraftPhoto({
  icao24,
  label,
  lat,
  lon,
}: {
  icao24: string;
  label: string;
  lat: number;
  lon: number;
}) {
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'none'>('loading');

  useEffect(() => {
    let alive = true;
    setState('loading');
    setPhoto(null);
    fetchAircraftPhoto(icao24)
      .then((res) => {
        if (!alive) return;
        if (res.photo?.thumbnail) {
          setPhoto(res.photo);
          setState('ok');
        } else {
          setState('none');
        }
      })
      .catch(() => alive && setState('none'));
    return () => {
      alive = false;
    };
  }, [icao24]);

  if (state === 'ok' && photo) {
    return (
      <a href={photo.link} target="_blank" rel="noreferrer" className="relative block">
        <img
          src={photo.thumbnail}
          alt={label}
          className="w-full rounded-sm border border-hud-emerald/30 bg-black"
        />
        <div className="absolute left-1.5 top-1.5 flex items-center gap-1 text-[9px] text-hud-sky">
          <span className="h-1.5 w-1.5 rounded-full bg-hud-sky animate-pulse" /> {label}
        </div>
        <div className="absolute right-1.5 bottom-1.5 text-[8px] text-white/70">
          © {photo.photographer}
        </div>
      </a>
    );
  }

  // Chargement ou aucune photo → repli sur le feed télémétrie.
  return (
    <div className="relative">
      <TelemetryFeed label={label} lat={lat} lon={lon} />
      <div className="absolute right-1.5 top-1.5 text-[8px] text-hud-amber/70">
        {state === 'loading' ? 'RECHERCHE PHOTO…' : 'PHOTO INDISPONIBLE'}
      </div>
    </div>
  );
}
