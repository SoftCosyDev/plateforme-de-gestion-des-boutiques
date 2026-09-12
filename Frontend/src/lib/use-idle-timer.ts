'use client' // Écoute des événements navigateur (souris/clavier) — jamais côté serveur.

import { useEffect, useRef } from 'react'

// Événements considérés comme une activité réelle — assez larges pour ne jamais verrouiller
// quelqu'un qui travaille activement (souris, clavier, tactile, défilement).
const ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll', 'wheel'] as const

// Déclenche `onIdle` après `timeoutMs` sans la moindre activité — remis à zéro à chaque
// événement. `enabled=false` coupe complètement l'écoute (ex: personne connecté, ou déjà
// verrouillé — inutile de continuer à mesurer une inactivité déjà constatée).
export function useIdleTimer(enabled: boolean, timeoutMs: number, onIdle: () => void) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!enabled) return

    const reset = () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(onIdle, timeoutMs)
    }
    reset()
    ACTIVITY_EVENTS.forEach(evt => window.addEventListener(evt, reset, { passive: true }))

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      ACTIVITY_EVENTS.forEach(evt => window.removeEventListener(evt, reset))
    }
  }, [enabled, timeoutMs, onIdle])
}
