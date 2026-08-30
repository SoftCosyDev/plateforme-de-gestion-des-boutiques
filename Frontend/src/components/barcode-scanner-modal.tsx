'use client'

import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { BarcodeFormat, DecodeHintType } from '@zxing/library'
import { X, Camera, ScanLine, Keyboard } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface ScannerControls {
  stop: () => void
}

interface BarcodeScannerModalProps {
  isOpen: boolean
  onClose: () => void
  onScan: (barcode: string) => void
}

// Restreint la lecture aux formats utilisés en commerce (plus rapide/fiable
// que de tester tous les formats à chaque frame) + TRY_HARDER pour mieux
// décoder les images moins nettes (caméra de téléphone via navigateur,
// moins performante que l'app appareil photo native).
const hints = new Map<DecodeHintType, unknown>()
hints.set(DecodeHintType.POSSIBLE_FORMATS, [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
])
hints.set(DecodeHintType.TRY_HARDER, true)

// Scan par caméra (téléphone/tablette) via @zxing/browser — fonctionne sur
// Android Chrome et iOS Safari (contrairement à l'API native BarcodeDetector,
// peu supportée sur iOS). Nécessite HTTPS ou localhost.
export default function BarcodeScannerModal({ isOpen, onClose, onScan }: BarcodeScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const controlsRef = useRef<ScannerControls | null>(null)
  const lastScanRef = useRef<{ code: string; time: number }>({ code: '', time: 0 })
  const [error, setError] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<string | null>(null)
  const [manualCode, setManualCode] = useState('')
  const [showManualEntry, setShowManualEntry] = useState(false)

  useEffect(() => {
    if (!isOpen || !videoRef.current) return

    let cancelled = false
    const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 100 })
    setError(null)
    setLastResult(null)

    reader
      .decodeFromConstraints(
        {
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        },
        videoRef.current,
        (result) => {
          if (cancelled || !result) return
          const code = result.getText()
          const now = Date.now()
          // Anti-doublon : ignore une re-détection du même code dans les 1.5s
          // (plusieurs frames successives détectent souvent le même code-barres)
          if (code === lastScanRef.current.code && now - lastScanRef.current.time < 1500) return
          lastScanRef.current = { code, time: now }
          setLastResult(code)
          onScan(code)
        }
      )
      .then((controls) => {
        if (cancelled) {
          controls.stop()
          return
        }
        controlsRef.current = controls
      })
      .catch(() => {
        if (!cancelled) {
          setError("Impossible d'accéder à la caméra. Vérifie les autorisations du navigateur pour ce site.")
        }
      })

    return () => {
      cancelled = true
      controlsRef.current?.stop()
      controlsRef.current = null
    }
  }, [isOpen, onScan])

  const submitManualCode = (e: React.FormEvent) => {
    e.preventDefault()
    const code = manualCode.trim()
    if (!code) return
    onScan(code)
    setLastResult(code)
    setManualCode('')
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="flex items-center justify-between p-4 text-white">
        <div className="flex items-center gap-2 font-bold">
          <ScanLine className="w-5 h-5" />
          Scanner un produit
        </div>
        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
          <X className="w-6 h-6" />
        </button>
      </div>

      <div className="flex-1 relative flex items-center justify-center overflow-hidden">
        {error ? (
          <div className="text-white text-center p-6 max-w-sm">
            <Camera className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p className="font-semibold">{error}</p>
          </div>
        ) : (
          <>
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="relative w-72 h-44 border-4 border-primary rounded-2xl overflow-hidden" style={{ boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)' }}>
                <div className="absolute left-0 right-0 h-0.5 bg-primary animate-[scan_1.8s_ease-in-out_infinite]" />
              </div>
            </div>
          </>
        )}
      </div>

      <div className="p-4 text-center text-white/80 text-sm font-medium space-y-3">
        <p>{lastResult ? `Dernier scan : ${lastResult}` : 'Vise le code-barres du produit dans le cadre — rapproche/éloigne un peu si ça ne prend pas'}</p>

        {showManualEntry ? (
          <form onSubmit={submitManualCode} className="flex gap-2">
            <Input
              autoFocus
              inputMode="numeric"
              placeholder="Saisir le code-barres manuellement"
              value={manualCode}
              onChange={e => setManualCode(e.target.value)}
              className="h-11 bg-white text-foreground"
            />
            <Button type="submit" className="h-11 shrink-0">Valider</Button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setShowManualEntry(true)}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-white/70 hover:text-white underline underline-offset-2"
          >
            <Keyboard className="w-3.5 h-3.5" />
            La caméra ne détecte pas ? Saisir le code manuellement
          </button>
        )}
      </div>

      <div className="p-4 pt-0">
        <Button onClick={onClose} className="w-full h-12 rounded-xl font-bold" variant="secondary">
          Terminer
        </Button>
      </div>

      <style jsx>{`
        @keyframes scan {
          0% { top: 0%; }
          50% { top: 100%; }
          100% { top: 0%; }
        }
      `}</style>
    </div>
  )
}
