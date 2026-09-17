'use client'

import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { BarcodeFormat, DecodeHintType } from '@zxing/library'
import { X, Camera, ScanLine, Keyboard, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface ScannerControls {
  stop: () => void
}

// Une ligne de l'historique affiché à côté de la caméra — le sens exact de "success"/"error"
// dépend de l'appelant (produit ajouté au panier vs code inconnu à la Caisse, code placé sur la
// bonne variante vs doublon aux Produits), ce composant se contente de l'afficher.
export interface ScannedItem {
  id: string | number
  label: string
  sublabel?: string
  status: 'success' | 'error'
}

interface BarcodeScannerModalProps {
  isOpen: boolean
  onClose: () => void
  onScan: (barcode: string) => void
  // Historique à afficher à côté du flux caméra, du plus récent au plus ancien (voir cashier/
  // products page). Absent/vide -> pas de panneau (repli sur l'ancien plein écran, ex: le
  // formulaire de connexion n'a pas besoin de ce contexte). Géré par l'APPELANT, pas ce
  // composant : lui seul sait ce que "réussi" signifie dans son contexte (trouvé en stock,
  // code déjà utilisé...).
  scannedItems?: ScannedItem[]
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
export default function BarcodeScannerModal({ isOpen, onClose, onScan, scannedItems }: BarcodeScannerModalProps) {
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
    // md:flex-row : caméra à gauche, historique des scans à droite — sur mobile (écran étroit,
    // usage le plus courant pour scanner), les deux restent empilés faute de place pour un
    // vrai côte-à-côte, mais la liste reste visible en dessous, jamais masquée par la caméra.
    <div className="fixed inset-0 z-50 bg-black flex flex-col md:flex-row">
      <div className="flex flex-col flex-1 min-w-0">
        <div className="flex items-center justify-between p-4 text-white">
          <div className="flex items-center gap-2 font-bold">
            <ScanLine className="w-5 h-5" />
            Scanner un produit
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 relative flex items-center justify-center overflow-hidden min-h-[240px]">
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
      </div>

      {/* Panneau des scans déjà effectués — seulement si l'appelant en fournit (voir le
          commentaire de scannedItems ci-dessus). Fond légèrement plus clair que le noir de la
          caméra pour bien le distinguer comme une zone à part, jamais un simple prolongement. */}
      {scannedItems && (
        <div className="w-full md:w-80 shrink-0 bg-[#141414] border-t md:border-t-0 md:border-l border-white/10 flex flex-col max-h-[45vh] md:max-h-none">
          <div className="p-4 border-b border-white/10 shrink-0">
            <p className="text-white font-bold text-sm">
              Produits scannés <span className="text-white/40 font-normal">({scannedItems.length})</span>
            </p>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {scannedItems.length === 0 && (
              <p className="text-white/40 text-xs text-center py-8">Les codes scannés apparaîtront ici.</p>
            )}
            {scannedItems.map(item => (
              <div
                key={item.id}
                className={`p-3 rounded-xl flex items-start gap-2.5 ${item.status === 'success' ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}
              >
                <div className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${item.status === 'success' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                  {item.status === 'success' ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-white text-sm font-bold truncate">{item.label}</p>
                  {item.sublabel && <p className="text-white/50 text-xs truncate mt-0.5">{item.sublabel}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
