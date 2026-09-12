'use client' // Superposition plein écran interactive — jamais rendue côté serveur.

import React, { useState } from 'react' // React + état local du formulaire de déverrouillage.
import { Lock, LogOut } from 'lucide-react' // Icônes.
import { Card } from '@/components/ui/card' // Conteneur visuel réutilisable.
import { Button } from '@/components/ui/button' // Bouton stylé réutilisable.
import { Input } from '@/components/ui/input' // Champ de saisie stylé réutilisable.
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar' // Photo/initiales du compte verrouillé.
import { initials } from '@/lib/utils' // Génère des initiales de repli si pas de photo.
import type { Session } from '@/lib/auth' // Type seulement — jamais de dépendance d'exécution vers auth.tsx (évite un cycle).

interface LockOverlayProps {
  session: Session
  // Rejette (throw) si le code est incorrect — voir accounts/serializers.py::UnlockSerializer.
  onUnlock: (pin: string) => Promise<void>
  onLogout: () => void
}

// Affiché par AuthProvider dès que la session est verrouillée (30 min d'inactivité, voir
// use-idle-timer.ts) — bloque toute interaction avec l'application tant que le bon code n'a pas
// été confirmé CÔTÉ SERVEUR. Le jeton reste valide pendant ce temps : ce n'est pas une
// déconnexion, seulement un écran de verrouillage, exactement comme un téléphone.
export default function LockOverlay({ session, onUnlock, onLogout }: LockOverlayProps) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await onUnlock(pin)
    } catch (err) {
      const data = (err as { response?: { data?: { pin?: string[] } } })?.response?.data
      setError(data?.pin?.[0] ?? 'Code incorrect.')
      setPin('')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/95 backdrop-blur-md">
      <Card className="relative w-full max-w-sm shadow-2xl border-border/50 p-6 space-y-5">
        <div className="flex flex-col items-center gap-3 text-center">
          <Avatar className="size-16">
            <AvatarImage src={session.profilePhoto ?? undefined} alt={session.name} />
            <AvatarFallback className="text-lg font-bold">{initials(session.name)}</AvatarFallback>
          </Avatar>
          <div>
            <p className="font-black text-lg flex items-center gap-2 justify-center"><Lock className="w-4 h-4 text-primary" /> {session.name}</p>
            <p className="text-xs text-muted-foreground mt-1">Session verrouillée après 30 minutes d&apos;inactivité</p>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <Input
            type="password"
            inputMode="numeric"
            autoFocus
            placeholder="Code PIN (ou mot de passe)"
            value={pin}
            onChange={e => { setPin(e.target.value); setError('') }}
            className="h-12 text-center text-lg tracking-widest"
          />
          {error && <p className="text-xs font-bold text-destructive bg-destructive/10 rounded-lg p-2.5 text-center">{error}</p>}
          <Button type="submit" disabled={submitting || pin.length === 0} className="w-full h-11 rounded-xl font-bold">
            {submitting ? 'Vérification...' : 'Déverrouiller'}
          </Button>
        </form>
        <button
          type="button"
          onClick={onLogout}
          className="w-full inline-flex items-center justify-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" /> Ce n&apos;est pas moi — se déconnecter
        </button>
      </Card>
    </div>
  )
}
