import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'

interface QRScannerProps {
  onScanned: (sessionId: string, token: string) => void
  onError?: (msg: string) => void
}

export function QRScanner({ onScanned, onError }: QRScannerProps) {
  const containerId = 'qr-scanner-container'
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const scanner = new Html5Qrcode(containerId)
    scannerRef.current = scanner

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (decodedText) => {
          try {
            // Accept both deep-link and web URL formats
            let payload: string | null = null

            if (decodedText.startsWith('skitracker://')) {
              const url = new URL(decodedText.replace('skitracker://', 'https://x.x/'))
              payload = url.searchParams.get('d')
            } else {
              const url = new URL(decodedText)
              payload = url.searchParams.get('d')
            }

            if (!payload) throw new Error('Invalid QR code format')

            const { s: sessionId, t: token } = JSON.parse(payload)
            if (!sessionId || !token) throw new Error('Missing sessionId or token')

            scanner.stop().catch(() => {})
            onScanned(sessionId, token)
          } catch (e) {
            const msg = e instanceof Error ? e.message : 'QR invalide'
            setError(msg)
            onError?.(msg)
          }
        },
        undefined // Ignore per-frame errors
      )
      .then(() => setScanning(true))
      .catch((e: Error) => {
        setError(e.message)
        onError?.(e.message)
      })

    return () => {
      scanner.isScanning && scanner.stop().catch(() => {})
    }
  }, [onScanned, onError])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
      <div
        id={containerId}
        style={{
          width: '100%',
          maxWidth: 320,
          borderRadius: 16,
          overflow: 'hidden',
          background: '#000',
          aspectRatio: '1',
        }}
      />
      {!scanning && !error && (
        <p style={{ color: '#94a3b8', fontSize: 13 }}>Accès caméra en cours…</p>
      )}
      {error && (
        <p style={{ color: '#ef4444', fontSize: 13 }}>{error}</p>
      )}
      {scanning && (
        <p style={{ color: '#94a3b8', fontSize: 13 }}>
          Pointe la caméra vers le QR code de l'admin
        </p>
      )}
    </div>
  )
}
