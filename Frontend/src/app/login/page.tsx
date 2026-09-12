'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth'
import { homeForPages } from '@/lib/pages'
import { VirkasBadge, VirkasIcon } from '@/components/virkas-mark'

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
  const [showPassword, setShowPassword] = useState(false)
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

  // Fond de marque Virkas TOUJOURS sombre, y compris pendant l'hydratation — jamais
  // `bg-background`/`text-foreground` sur cet écran : ces tokens suivent le thème clair/sombre
  // choisi ailleurs dans l'app, ce qui casserait l'identité visuelle voulue ici (voir le
  // commentaire de VirkasWordmark côté tone='light').
  if (!hydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0817] text-white/50 text-sm font-medium">
        Chargement...
      </div>
    )
  }

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4 overflow-hidden bg-[#0a0817]">
      {/* Halos de couleur + "V" géant en filigrane -> donne au fond une texture de marque sans
          dépendre d'une image bitmap (voir components/virkas-mark.tsx). */}
      <div className="pointer-events-none absolute -top-40 -left-32 w-[28rem] h-[28rem] rounded-full bg-violet-600/30 blur-[110px]" />
      <div className="pointer-events-none absolute -bottom-48 -right-32 w-[34rem] h-[34rem] rounded-full bg-blue-600/25 blur-[130px]" />
      <VirkasIcon className="pointer-events-none absolute -right-28 -bottom-28 w-[26rem] h-[26rem] opacity-[0.07] rotate-[8deg]" />

      <div className="relative w-full max-w-sm">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur-2xl shadow-2xl shadow-black/50 p-8 space-y-8">
          <div className="flex flex-col items-center text-center space-y-4">
            <VirkasBadge className="w-16 h-16" />
            <div>
              <h1 className="text-2xl font-black text-white">Connexion</h1>
              <p className="text-sm text-white/50 font-medium mt-1">Accède à ton espace de gestion</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* !bg-white/!text-slate-900 (avec !) : le composant Input de base pose son propre
                dark:bg-input/30 (fond sombre translucide, voir components/ui/input.tsx) — sans le
                "!", cette règle regagne la main dès que l'appareil/l'app est en thème sombre,
                rendant le texte saisi illisible (fond sombre, texte sombre). Ce préfixe force la
                priorité, cohérent avec le choix de cet écran de ne JAMAIS suivre le thème clair/
                sombre de l'app (voir le commentaire plus haut sur bg-[#0a0817]). */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-white/50 uppercase">Identifiant</label>
              <Input
                required
                autoFocus
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Ton identifiant"
                className="h-12 rounded-xl !bg-white !text-slate-900 placeholder:!text-slate-400 !border-white/10 focus-visible:ring-violet-400/60 focus-visible:border-violet-400"
                autoComplete="username"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-white/50 uppercase">Mot de passe</label>
              <div className="relative">
                <Input
                  required
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="h-12 rounded-xl pr-11 !bg-white !text-slate-900 placeholder:!text-slate-400 !border-white/10 focus-visible:ring-violet-400/60 focus-visible:border-violet-400"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-xs font-bold text-red-200 bg-red-500/15 border border-red-500/20 rounded-lg p-2.5 text-center">{error}</p>
            )}

            <Button
              type="submit" disabled={submitting}
              className="w-full h-12 rounded-xl font-bold gap-2 bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white shadow-lg shadow-violet-900/40"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Se connecter'}
            </Button>
          </form>

          <p className="text-center">
            <Link href="/login/recuperer" className="text-xs font-bold text-violet-300 hover:text-violet-200 hover:underline">
              Identifiant ou mot de passe oublié ?
            </Link>
          </p>
        </div>

        <p className="text-center text-[13px] text-white/30 font-bold tracking-[0.15em] uppercase mt-6">
          Virkas · Dev &amp; Design
        </p>
      </div>
    </div>
  )
}
