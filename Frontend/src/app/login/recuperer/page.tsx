'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Eye, EyeOff, KeyRound, Loader2, ShieldCheck } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import api from '@/lib/api'
import { VirkasBadge, VirkasIcon } from '@/components/virkas-mark'

// Flux public en 2 étapes, sans authentification (voir accounts/views.py :
// SecurityQuestionLookupView + PasswordResetView) — pas de lien envoyé par email/SMS, cette
// plateforme n'a ni l'un ni l'autre pour ses comptes (voir accounts/models.py::User). La preuve
// d'identité est la réponse à la question de sécurité configurée dans "Mon profil".
type Step = 'username' | 'answer' | 'done'

function readErrorMessage(err: any, fallback: string): string {
  const data = err?.response?.data
  if (!data) return fallback
  return (
    data.non_field_errors?.[0] ||
    data.answer?.[0] ||
    data.new_password?.[0] ||
    data.username?.[0] ||
    data.detail ||
    fallback
  )
}

export default function RecoverAccountPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('username')

  const [username, setUsername] = useState('')
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const res = await api.post<{ question: string }>('/password-recovery/question/', { username: username.trim() })
      setQuestion(res.data.question)
      setStep('answer')
    } catch (err: any) {
      setError(readErrorMessage(err, "Impossible de retrouver ce compte."))
    } finally {
      setSubmitting(false)
    }
  }

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (newPassword !== confirmPassword) {
      setError('La confirmation ne correspond pas au nouveau mot de passe.')
      return
    }
    setSubmitting(true)
    try {
      await api.post('/password-recovery/reset/', {
        username: username.trim(),
        answer,
        new_password: newPassword,
      })
      setStep('done')
    } catch (err: any) {
      setError(readErrorMessage(err, 'Impossible de réinitialiser le mot de passe.'))
    } finally {
      setSubmitting(false)
    }
  }

  // Même habillage de marque que /login (voir ce fichier pour le détail des choix) — cet écran
  // fait partie du même parcours d'authentification, il doit rester visuellement cohérent.
  return (
    <div className="min-h-screen relative flex items-center justify-center p-4 overflow-hidden bg-[#0a0817]">
      <div className="pointer-events-none absolute -top-40 -left-32 w-[28rem] h-[28rem] rounded-full bg-violet-600/30 blur-[110px]" />
      <div className="pointer-events-none absolute -bottom-48 -right-32 w-[34rem] h-[34rem] rounded-full bg-blue-600/25 blur-[130px]" />
      <VirkasIcon className="pointer-events-none absolute -right-28 -bottom-28 w-[26rem] h-[26rem] opacity-[0.07] rotate-[8deg]" />

      <div className="relative w-full max-w-sm">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur-2xl shadow-2xl shadow-black/50 p-8 space-y-8">
          <div className="flex flex-col items-center text-center space-y-4">
            <div className="relative">
              <VirkasBadge className="w-16 h-16" />
              {/* Petit badge de statut superposé -> distingue cet écran de /login au premier coup
                  d'œil sans abandonner l'identité de marque (le badge Virkas reste le même). */}
              <div className="absolute -bottom-1.5 -right-1.5 w-6 h-6 rounded-full bg-[#12101f] border-2 border-[#0a0817] flex items-center justify-center">
                {step === 'done' ? <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> : <KeyRound className="w-3.5 h-3.5 text-violet-300" />}
              </div>
            </div>
            <div>
              <h1 className="text-2xl font-black text-white">Compte oublié ?</h1>
              <p className="text-sm text-white/50 font-medium mt-1">
                {step === 'username' && "Indique ton identifiant, on te pose ta question de sécurité."}
                {step === 'answer' && "Réponds à ta question de sécurité pour choisir un nouveau mot de passe."}
                {step === 'done' && 'Ton mot de passe a été réinitialisé.'}
              </p>
            </div>
          </div>

          {step === 'username' && (
            <form onSubmit={handleLookup} className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-white/50 uppercase">Identifiant</label>
                <Input
                  required
                  autoFocus
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="Ton identifiant"
                  // !bg-white/!text-slate-900 : voir le commentaire équivalent dans /login —
                  // sans le "!", dark:bg-input/30 posé par le composant Input reprend la main en
                  // thème sombre et rend le texte saisi illisible.
                  className="h-12 rounded-xl !bg-white !text-slate-900 placeholder:!text-slate-400 !border-white/10 focus-visible:ring-violet-400/60 focus-visible:border-violet-400"
                  autoComplete="username"
                />
              </div>

              {error && <p className="text-xs font-bold text-red-200 bg-red-500/15 border border-red-500/20 rounded-lg p-2.5 text-center">{error}</p>}

              <Button
                type="submit" disabled={submitting}
                className="w-full h-12 rounded-xl font-bold gap-2 bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white shadow-lg shadow-violet-900/40"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Continuer'}
              </Button>
            </form>
          )}

          {step === 'answer' && (
            <form onSubmit={handleReset} className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-white/50 uppercase">Question de sécurité</label>
                <p className="text-sm font-bold p-3 rounded-xl bg-white/10 text-white">{question}</p>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-white/50 uppercase">Ta réponse</label>
                <Input
                  required
                  autoFocus
                  value={answer}
                  onChange={e => setAnswer(e.target.value)}
                  // !bg-white/!text-slate-900 : voir le commentaire équivalent dans /login —
                  // sans le "!", dark:bg-input/30 posé par le composant Input reprend la main en
                  // thème sombre et rend le texte saisi illisible.
                  className="h-12 rounded-xl !bg-white !text-slate-900 placeholder:!text-slate-400 !border-white/10 focus-visible:ring-violet-400/60 focus-visible:border-violet-400"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-white/50 uppercase">Nouveau mot de passe</label>
                <div className="relative">
                  <Input
                    required
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    // !bg-white/!text-slate-900 : voir le commentaire équivalent dans /login —
                    // sans le "!", dark:bg-input/30 posé par le composant Input reprend la main en
                    // thème sombre et rend le texte saisi illisible.
                    className="h-12 rounded-xl pr-11 !bg-white !text-slate-900 placeholder:!text-slate-400 !border-white/10 focus-visible:ring-violet-400/60 focus-visible:border-violet-400"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    tabIndex={-1}
                    aria-label={showNewPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                  >
                    {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-white/50 uppercase">Confirmer le mot de passe</label>
                <div className="relative">
                  <Input
                    required
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    // !bg-white/!text-slate-900 : voir le commentaire équivalent dans /login —
                    // sans le "!", dark:bg-input/30 posé par le composant Input reprend la main en
                    // thème sombre et rend le texte saisi illisible.
                    className="h-12 rounded-xl pr-11 !bg-white !text-slate-900 placeholder:!text-slate-400 !border-white/10 focus-visible:ring-violet-400/60 focus-visible:border-violet-400"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    tabIndex={-1}
                    aria-label={showConfirmPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                  >
                    {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {error && <p className="text-xs font-bold text-red-200 bg-red-500/15 border border-red-500/20 rounded-lg p-2.5 text-center">{error}</p>}

              <Button
                type="submit" disabled={submitting}
                className="w-full h-12 rounded-xl font-bold gap-2 bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white shadow-lg shadow-violet-900/40"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Réinitialiser le mot de passe'}
              </Button>
            </form>
          )}

          {step === 'done' && (
            <div className="space-y-4">
              <p className="text-xs font-bold text-emerald-200 bg-emerald-500/15 border border-emerald-500/20 rounded-lg p-3 text-center">
                Mot de passe réinitialisé avec succès. Tu peux te reconnecter.
              </p>
              <Button
                onClick={() => router.replace('/login')}
                className="w-full h-12 rounded-xl font-bold bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white shadow-lg shadow-violet-900/40"
              >
                Aller à la connexion
              </Button>
            </div>
          )}

          {step !== 'done' && (
            <div className="space-y-2 text-center">
              <p className="text-[13px] text-white/40">
                Pas de question de sécurité configurée sur ce compte ? Contacte ton propriétaire de
                boutique (ou le SuperAdmin s&apos;il s&apos;agit d&apos;un compte propriétaire).
              </p>
              <Link href="/login" className="inline-flex items-center gap-1.5 text-xs font-bold text-violet-300 hover:text-violet-200 hover:underline">
                <ArrowLeft className="w-3.5 h-3.5" /> Retour à la connexion
              </Link>
            </div>
          )}
        </div>

        <p className="text-center text-[13px] text-white/30 font-bold tracking-[0.15em] uppercase mt-6">
          Virkas · Dev &amp; Design
        </p>
      </div>
    </div>
  )
}
