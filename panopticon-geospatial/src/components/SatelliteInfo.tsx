import { useEffect, useState } from 'react';
import { fetchSatelliteInfo, type SatelliteInfo as Info } from '../services/api';
import TelemetryFeed from './TelemetryFeed';

function CopyTleButton({ tle }: { tle: { name: string; l1: string; l2: string } }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(`${tle.name}\n${tle.l1}\n${tle.l2}`)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); })
      .catch(() => {});
  };
  return (
    <button
      onClick={copy}
      title="Copier le TLE (3 lignes)"
      className="flex items-center gap-1 px-2 py-0.5 rounded border border-hud-emerald/30 text-[10px] font-mono text-hud-emerald/70 hover:text-hud-emerald hover:border-hud-emerald/60 transition-colors"
    >
      {copied ? (
        <span className="text-hud-emerald">✓ COPIÉ</span>
      ) : (
        <>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
          </svg>
          TLE
        </>
      )}
    </button>
  );
}

const TYPE_LABEL: Record<string, string> = {
  PAY: 'Charge utile',
  'R/B': 'Corps de fusée',
  DEB: 'Débris',
  UNK: 'Inconnu',
};
const STATUS_LABEL: Record<string, string> = {
  '+': 'Opérationnel',
  '-': 'Inactif',
  P: 'Partiellement op.',
  B: 'Veille (standby)',
  S: 'Réserve (spare)',
  X: 'Étendu',
  D: 'Désorbité',
};

function InfoRow({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex justify-between items-baseline border-b border-hud-emerald/10 py-1">
      <span className="hud-label">{label}</span>
      <span className={`text-xs font-medium ${accent ?? 'text-hud-emerald'} text-right max-w-[60%] truncate`}>
        {value}
      </span>
    </div>
  );
}

/** Fiche satellite : photo + mission (Wikipédia) + catalogue (SATCAT). */
export default function SatelliteInfo({
  norad,
  name,
  group,
  lat,
  lon,
  tle,
}: {
  norad: string;
  name: string;
  group: string;
  lat: number;
  lon: number;
  tle: { name: string; l1: string; l2: string } | null;
}) {
  const [info, setInfo] = useState<Info | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setInfo(null);
    setExpanded(false);
    fetchSatelliteInfo(norad, name, group)
      .then((res) => alive && setInfo(res))
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [norad, name, group]);

  const wiki = info?.wiki;
  const sc = info?.satcat;
  const extract = wiki?.extract || '';
  const image = info?.image;

  return (
    <div>
      {/* Bouton copier TLE */}
      {tle && (
        <div className="flex justify-end mb-1.5">
          <CopyTleButton tle={tle} />
        </div>
      )}

      {/* Photo réelle (Commons/Wikipédia) ou repli feed télémétrie */}
      {image ? (
        <a
          href={wiki?.url || image}
          target="_blank"
          rel="noreferrer"
          className="relative block"
        >
          <img
            src={image}
            alt={name}
            className="w-full max-h-48 object-cover rounded-sm border border-hud-emerald/30 bg-black"
          />
          <div className="absolute left-1.5 top-1.5 flex items-center gap-1 text-[9px] text-hud-emerald/80">
            <span className="h-1.5 w-1.5 rounded-full bg-hud-emerald animate-pulse" /> {wiki?.title || name}
          </div>
        </a>
      ) : (
        <div className="relative">
          <TelemetryFeed label={`NORAD ${norad}`} lat={lat} lon={lon} />
          <div className="absolute right-1.5 top-1.5 text-[8px] text-hud-amber/70">
            {loading ? 'RECHERCHE…' : 'PAS D’IMAGE'}
          </div>
        </div>
      )}

      {/* Mission (extrait Wikipédia) */}
      {extract && (
        <div className="mt-2">
          <div className="hud-label mb-1">MISSION</div>
          <p className={`text-[11px] leading-snug text-hud-emerald/80 ${expanded ? '' : 'line-clamp-4'}`}>
            {extract}
          </p>
          {extract.length > 180 && (
            <button
              onClick={() => setExpanded((e) => !e)}
              className="text-[10px] text-hud-sky hover:underline mt-0.5"
            >
              {expanded ? '— réduire' : '+ lire plus'}
            </button>
          )}
        </div>
      )}

      {/* Catalogue SATCAT */}
      {sc && (
        <div className="mt-2">
          <div className="hud-label mb-1">CATALOGUE</div>
          <InfoRow label="TYPE OBJET" value={TYPE_LABEL[sc.type] || sc.type || '—'} accent="text-hud-amber" />
          <InfoRow label="DÉSIGNATION INTL" value={sc.intlDes || '—'} />
          <InfoRow label="OPÉRATEUR" value={sc.owner || '—'} />
          <InfoRow label="LANCEMENT" value={sc.launchDate || '—'} />
          {sc.launchSite && <InfoRow label="SITE LANCEMENT" value={sc.launchSite} />}
          <InfoRow
            label="STATUT"
            value={STATUS_LABEL[sc.status] || sc.status || '—'}
            accent={sc.status === 'D' ? 'text-hud-danger' : 'text-hud-emerald'}
          />
          {sc.decayDate && <InfoRow label="DÉSORBITÉ LE" value={sc.decayDate} accent="text-hud-danger" />}
        </div>
      )}
    </div>
  );
}
