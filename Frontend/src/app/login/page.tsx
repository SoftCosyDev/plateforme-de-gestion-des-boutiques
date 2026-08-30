'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Store, Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth'
import { homeForPages } from '@/lib/pages'

// Pas de grille de profils : sur une plateforme multi-boutique/multi-
// propriétaire, exposer publiquement l'annuaire de tout le monde (noms,
// rôles, boutiques) avant même de s'être authentifié n'est ni pro ni
// sécurisé. On demande un identifiant + mot de passe, et l'application
// détecte seule le compte et redirige en conséquence.
export default function LoginPage() {
  const { session, hydrated, login } = useAuth()
  const router = useRouter()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!hydrated || !session) return
    router.replace(session.kind === 'employee' ? homeForPages(session.allowedPages) : '/admin')
  }, [hydrated, session, router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      const result = await login(username, password)
      router.replace(result.kind === 'employee' ? homeForPages(result.allowedPages) : '/admin')
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      const message = err?.response?.data?.non_field_errors?.[0]
      setError(
        detail === 'lockout'
          ? 'Trop de tentatives échouées, veuillez attendre 5 min pour vous reconnecter.'
          : message || 'Identifiant ou mot de passe incorrect.'
      )
    } finally {
      setSubmitting(false)
    }
  }

  if (!hydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground text-sm font-medium">
        Chargement...
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center mx-auto">
            <Store className="w-7 h-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-black text-foreground">Connexion</h1>
          <p className="text-sm text-muted-foreground font-medium">Accède à ton espace de gestion</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-bold text-muted-foreground uppercase">Identifiant</label>
            <Input
              required
              autoFocus
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Ton identifiant"
              className="h-12 rounded-xl"
              autoComplete="username"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-muted-foreground uppercase">Mot de passe</label>
            <Input
              required
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              className="h-12 rounded-xl"
              autoComplete="current-password"
            />
          </div>

          {error && (
            <p className="text-xs font-bold text-destructive bg-destructive/10 rounded-lg p-2.5 text-center">{error}</p>
          )}

          <Button type="submit" disabled={submitting} className="w-full h-12 rounded-xl font-bold gap-2">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Se connecter'}
          </Button>
        </form>
      </div>
    </div>
  )
}
