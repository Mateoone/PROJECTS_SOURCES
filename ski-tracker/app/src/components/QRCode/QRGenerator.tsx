import { QRCodeSVG } from 'qrcode.react'

interface QRGeneratorProps {
  token: string
  sessionId: string
  stationName: string
}

export function QRGenerator({ token, sessionId, stationName }: QRGeneratorProps) {
  // Encode minimal data as a direct HTTPS join link
  const payload = JSON.stringify({ s: sessionId, t: token })
  const joinUrl = `${window.location.origin}/join?d=${encodeURIComponent(payload)}`
  const qrValue = joinUrl

  const handleShare = async () => {
    if ('share' in navigator) {
      try {
        await navigator.share({
          title: 'Rejoindre ma session ski',
          text: `Rejoins ma session sur ${stationName}`,
          url: joinUrl,
        })
        return
      } catch {
        // Fall through to clipboard
      }
    }
    await navigator.clipboard.writeText(joinUrl)
    alert('Lien copié dans le presse-papiers !')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
      <div style={{
        background: '#fff',
        borderRadius: 16,
        padding: 20,
        boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
      }}>
        <QRCodeSVG
          value={qrValue}
          size={220}
          level="M"
          includeMargin={false}
          imageSettings={{
            src: '/icons/icon.svg',
            x: undefined, y: undefined,
            height: 36, width: 36,
            excavate: true,
          }}
        />
      </div>

      <div style={{ textAlign: 'center' }}>
        <p style={{ color: '#94a3b8', fontSize: 13, margin: 0 }}>
          Fais scanner ce QR code aux membres de ton équipe
        </p>
        <p style={{ color: '#475569', fontSize: 11, margin: '4px 0 0' }}>
          {stationName}
        </p>
      </div>

      <button
        onClick={handleShare}
        style={{
          background: '#3b82f6',
          border: 'none',
          borderRadius: 12,
          padding: '14px 28px',
          color: '#fff',
          fontSize: 15,
          fontWeight: 600,
          cursor: 'pointer',
          minHeight: 56,
          width: '100%',
        }}
      >
        Partager le lien
      </button>
    </div>
  )
}
