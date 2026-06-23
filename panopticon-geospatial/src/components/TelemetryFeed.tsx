/** Widget imitant un feed de télémétrie vidéo orbitale (100 % CSS/SVG). */
export default function TelemetryFeed({
  label,
  lat,
  lon,
}: {
  label: string;
  lat?: number;
  lon?: number;
}) {
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-sm border border-hud-emerald/30 bg-black">
      {/* fond balayé */}
      <div
        className="absolute inset-0 opacity-40"
        style={{
          background:
            'radial-gradient(circle at 50% 40%, rgba(16,255,160,0.25), transparent 60%)',
        }}
      />
      {/* grille */}
      <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
        <defs>
          <pattern id="tg" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M20 0H0V20" fill="none" stroke="rgba(16,255,160,0.18)" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#tg)" />
        {/* réticule */}
        <line x1="50%" y1="0" x2="50%" y2="100%" stroke="rgba(16,255,160,0.4)" strokeWidth="0.5" />
        <line x1="0" y1="50%" x2="100%" y2="50%" stroke="rgba(16,255,160,0.4)" strokeWidth="0.5" />
        <circle cx="50%" cy="50%" r="22" fill="none" stroke="rgba(255,179,71,0.6)" strokeWidth="1" />
        <circle cx="50%" cy="50%" r="3" fill="rgba(255,77,94,0.9)" />
      </svg>
      {/* ligne de scan */}
      <div className="absolute inset-x-0 h-px bg-hud-emerald/60 animate-scan" />

      {/* overlays texte */}
      <div className="absolute left-1.5 top-1.5 flex items-center gap-1 text-[9px] text-hud-danger">
        <span className="h-1.5 w-1.5 rounded-full bg-hud-danger animate-pulse" /> REC
      </div>
      <div className="absolute right-1.5 top-1.5 text-[9px] text-hud-emerald/70">ORB-CAM 01</div>
      <div className="absolute left-1.5 bottom-1.5 text-[9px] text-hud-emerald/80 truncate max-w-[80%]">
        {label}
      </div>
      <div className="absolute right-1.5 bottom-1.5 text-[8px] text-hud-emerald/60 text-right">
        {lat != null && <div>LAT {lat.toFixed(3)}</div>}
        {lon != null && <div>LON {lon.toFixed(3)}</div>}
      </div>
    </div>
  );
}
