'use client'

import React, { useEffect, useState } from 'react'
import { X, Save, Camera } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useAuth } from '@/lib/auth'
import { ACCESS_ROLE_LABELS } from '@/lib/types'
import { initials } from '@/lib/utils'
import api from '@/lib/api'

interface ProfileModalProps {
  onClose: () => void
}

interface MeResponse {
  id: number
  username: string
  full_name: string
  profile_photo: string | null
  account_type: 'SUPERADMIN' | 'OWNER' | 'EMPLOYEE'
  is_active: boolean
  has_pin: boolean // Un PIN est déjà configuré ou non — sert à choisir "Configurer"/"Modifier".
  // Idem pour la question de sécurité utilisée par "identifiant/mot de passe oublié" (voir
  // accounts/views.py::SecurityQuestionLookupView) — security_question sert à pré-remplir le
  // formulaire en mode "Modifier", jamais la réponse (jamais renvoyée par l'API).
  has_security_question: boolean
  security_question: string
}

// Ouvert depuis la pastille de session dans la sidebar — permet à N'IMPORTE
// QUEL compte connecté (employé, propriétaire ou super admin) de modifier
// son propre nom et son mot de passe, sans passer par la gestion des
// employés (qui, elle, reste réservée à la gestion des AUTRES comptes) —
// voir accounts.UserViewSet côté backend, volontairement limité à `me`.
export default function ProfileModal({ onClose }: ProfileModalProps) {
  const { session } = useAuth()

  const [me, setMe] = useState<MeResponse | null>(null)
  const [name, setName] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [saving, setSaving] = useState(false)

  // Code PIN de verrouillage — formulaire séparé (jamais imbriqué dans le <form> principal ci-
  // dessous, pour qu'un Entrée frappé ici ne déclenche jamais accidentellement l'ENREGISTREMENT
  // du nom/mot de passe à la place).
  const [showPinForm, setShowPinForm] = useState(false)
  const [pinPassword, setPinPassword] = useState('')
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [pinError, setPinError] = useState<string | null>(null)
  const [pinSuccess, setPinSuccess] = useState(false)
  const [savingPin, setSavingPin] = useState(false)

  // Question de sécurité utilisée par "identifiant/mot de passe oublié" — même principe de
  // formulaire séparé que le PIN ci-dessus, et pour la même raison.
  const [showSecurityForm, setShowSecurityForm] = useState(false)
  const [securityPassword, setSecurityPassword] = useState('')
  const [securityQuestion, setSecurityQuestion] = useState('')
  const [securityAnswer, setSecurityAnswer] = useState('')
  const [securityError, setSecurityError] = useState<string | null>(null)
  const [securitySuccess, setSecuritySuccess] = useState(false)
  const [savingSecurity, setSavingSecurity] = useState(false)

  // Photo de profil — upload IMMÉDIAT dès le choix du fichier (contrairement au formulaire de
  // création d'employé, ce compte existe déjà, pas besoin d'attendre un enregistrement).
  // `photoPreview` affiche un aperçu local (blob://) le temps que l'upload réel se termine, puis
  // bascule sur l'URL définitive renvoyée par le serveur.
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)

  useEffect(() => {
    api.get<MeResponse>('/users/me/').then(res => {
      setMe(res.data)
      setName(res.data.full_name)
    })
  }, [])

  if (!session || !me) return null

  const roleLabel =
    session.kind === 'employee' ? (ACCESS_ROLE_LABELS[session.accessRole as keyof typeof ACCESS_ROLE_LABELS] ?? session.accessRole)
    : session.kind === 'owner' ? 'Propriétaire'
    : 'Super Administrateur'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const wantsPasswordChange = currentPassword.length > 0 || newPassword.length > 0 || confirmPassword.length > 0
    if (wantsPasswordChange && newPassword !== confirmPassword) {
      setError('La confirmation ne correspond pas au nouveau mot de passe.')
      return
    }

    setSaving(true)
    try {
      const res = await api.patch<MeResponse>('/users/me/', { full_name: name.trim() || me.full_name })
      setMe(res.data)

      if (wantsPasswordChange) {
        await api.post('/users/change-password/', { current_password: currentPassword, new_password: newPassword })
      }

      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setSuccess(true)
      setTimeout(() => setSuccess(false), 2500)
    } catch (err: any) {
      const data = err?.response?.data
      setError(data?.current_password?.[0] || data?.new_password?.[0] || data?.detail || 'Une erreur est survenue.')
    } finally {
      setSaving(false)
    }
  }

  const handleSetPin = async () => {
    setPinError(null)
    if (!/^\d{4,6}$/.test(newPin)) {
      setPinError('Le code PIN doit contenir entre 4 et 6 chiffres.')
      return
    }
    if (newPin !== confirmPin) {
      setPinError('La confirmation ne correspond pas au code PIN.')
      return
    }
    setSavingPin(true)
    try {
      await api.post('/users/set-pin/', { password: pinPassword, pin: newPin })
      setMe(prev => (prev ? { ...prev, has_pin: true } : prev))
      setPinPassword('')
      setNewPin('')
      setConfirmPin('')
      setShowPinForm(false)
      setPinSuccess(true)
      setTimeout(() => setPinSuccess(false), 2500)
    } catch (err: any) {
      const data = err?.response?.data
      setPinError(data?.password?.[0] || data?.pin?.[0] || 'Une erreur est survenue.')
    } finally {
      setSavingPin(false)
    }
  }

  const handleSetSecurityQuestion = async () => {
    setSecurityError(null)
    if (securityQuestion.trim().length < 3) {
      setSecurityError('La question doit contenir au moins 3 caractères.')
      return
    }
    if (securityAnswer.trim().length < 2) {
      setSecurityError('La réponse doit contenir au moins 2 caractères.')
      return
    }
    setSavingSecurity(true)
    try {
      await api.post('/users/set-security-question/', {
        password: securityPassword,
        question: securityQuestion.trim(),
        answer: securityAnswer,
      })
      setMe(prev => (prev ? { ...prev, has_security_question: true, security_question: securityQuestion.trim() } : prev))
      setSecurityPassword('')
      setSecurityAnswer('')
      setShowSecurityForm(false)
      setSecuritySuccess(true)
      setTimeout(() => setSecuritySuccess(false), 2500)
    } catch (err: any) {
      const data = err?.response?.data
      setSecurityError(data?.password?.[0] || data?.question?.[0] || data?.answer?.[0] || 'Une erreur est survenue.')
    } finally {
      setSavingSecurity(false)
    }
  }

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoError(null)
    setPhotoPreview(URL.createObjectURL(file))
    setUploadingPhoto(true)
    try {
      const formData = new FormData()
      formData.append('photo', file)
      const res = await api.post<{ url: string }>('/users/upload-photo/', formData)
      setMe(prev => (prev ? { ...prev, profile_photo: res.data.url } : prev))
      // Bascule sur l'URL définitive maintenant connue — sans ça, `photoPreview` (toujours
      // défini) resterait prioritaire pour toujours et l'aperçu local ne serait jamais remplacé.
      setPhotoPreview(null)
    } catch {
      setPhotoError("Impossible d'envoyer la photo.")
      setPhotoPreview(null)
    } finally {
      setUploadingPhoto(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <Card className="relative w-full max-w-md shadow-2xl border-border/50 max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-border/50 flex items-center justify-between">
          <h2 className="text-xl font-black">Mon profil</h2>
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full"><X className="w-5 h-5" /></Button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="p-4 rounded-xl bg-muted/30 flex items-center gap-3">
            <div className="relative shrink-0">
              <Avatar className="size-11">
                <AvatarImage src={photoPreview ?? me.profile_photo ?? undefined} alt={me.full_name} />
                <AvatarFallback className="font-bold">{initials(me.full_name)}</AvatarFallback>
              </Avatar>
              <label
                htmlFor="profile-photo-input"
                className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center cursor-pointer border-2 border-card"
                title="Changer la photo"
              >
                <Camera className="w-3 h-3" />
              </label>
              <input id="profile-photo-input" type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} disabled={uploadingPhoto} />
            </div>
            <div>
              <p className="font-bold">{me.full_name}</p>
              <Badge variant="outline" className="text-[12px] mt-1">{roleLabel}</Badge>
              {uploadingPhoto && <p className="text-[12px] text-muted-foreground mt-1">Envoi en cours...</p>}
              {photoError && <p className="text-[12px] text-destructive mt-1">{photoError}</p>}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-muted-foreground uppercase">Identifiant de connexion</label>
            <Input value={me.username} disabled className="h-11 font-mono opacity-70" />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-muted-foreground uppercase">Nom complet</label>
            <Input value={name} onChange={e => setName(e.target.value)} className="h-11" />
          </div>

          <div className="pt-2 border-t border-border/40 space-y-3">
            <p className="text-xs font-bold text-muted-foreground uppercase">Changer le mot de passe (optionnel)</p>
            <div className="space-y-2">
              <label className="text-[12px] font-bold text-muted-foreground uppercase">Mot de passe actuel</label>
              <Input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} className="h-10" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-[12px] font-bold text-muted-foreground uppercase">Nouveau</label>
                <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="h-10" />
              </div>
              <div className="space-y-2">
                <label className="text-[12px] font-bold text-muted-foreground uppercase">Confirmer</label>
                <Input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="h-10" />
              </div>
            </div>
          </div>

          {error && <p className="text-xs font-bold text-destructive bg-destructive/10 rounded-lg p-2.5">{error}</p>}
          {success && <p className="text-xs font-bold text-green-600 bg-green-500/10 rounded-lg p-2.5">Profil mis à jour.</p>}

          <div className="pt-2 flex gap-3">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1 h-11 rounded-xl font-bold">Fermer</Button>
            <Button type="submit" disabled={saving} className="flex-1 h-11 rounded-xl font-bold gap-2"><Save className="w-4 h-4" />Enregistrer</Button>
          </div>
        </form>

        {/* Hors du <form> ci-dessus, volontairement : un Entrée ici ne doit jamais déclencher
            l'enregistrement du nom/mot de passe à la place. */}
        <div className="px-6 pb-6 space-y-3">
          <div className="pt-2 border-t border-border/40 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-muted-foreground uppercase">Code PIN de verrouillage</p>
              <button
                type="button"
                onClick={() => { setShowPinForm(v => !v); setPinError(null) }}
                className="text-[13px] font-bold text-primary hover:underline"
              >
                {me.has_pin ? 'Modifier' : 'Configurer'}
              </button>
            </div>
            <p className="text-[13px] text-muted-foreground">
              Sert à redéverrouiller rapidement ta session après 30 minutes d&apos;inactivité — jamais à te connecter.
            </p>
            {showPinForm && (
              <div className="space-y-2 p-3 rounded-xl bg-muted/30">
                <Input
                  type="password" placeholder="Mot de passe actuel" value={pinPassword}
                  onChange={e => setPinPassword(e.target.value)} className="h-10"
                />
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="password" inputMode="numeric" placeholder="Nouveau PIN (4-6 chiffres)"
                    value={newPin} onChange={e => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="h-10"
                  />
                  <Input
                    type="password" inputMode="numeric" placeholder="Confirmer"
                    value={confirmPin} onChange={e => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="h-10"
                  />
                </div>
                {pinError && <p className="text-xs font-bold text-destructive bg-destructive/10 rounded-lg p-2">{pinError}</p>}
                <Button type="button" onClick={handleSetPin} disabled={savingPin} className="w-full h-10 rounded-lg font-bold text-sm">
                  {savingPin ? 'Enregistrement...' : 'Enregistrer le PIN'}
                </Button>
              </div>
            )}
            {pinSuccess && <p className="text-xs font-bold text-green-600 bg-green-500/10 rounded-lg p-2">Code PIN enregistré.</p>}
          </div>

          <div className="pt-2 border-t border-border/40 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-muted-foreground uppercase">Question de sécurité</p>
              <button
                type="button"
                onClick={() => {
                  setShowSecurityForm(v => !v)
                  setSecurityError(null)
                  setSecurityQuestion(me.security_question || '')
                }}
                className="text-[13px] font-bold text-primary hover:underline"
              >
                {me.has_security_question ? 'Modifier' : 'Configurer'}
              </button>
            </div>
            <p className="text-[13px] text-muted-foreground">
              Sert à retrouver ton compte depuis l&apos;écran de connexion si tu oublies ton mot de passe.
            </p>
            {me.has_security_question && !showSecurityForm && (
              <p className="text-xs font-bold p-2.5 rounded-lg bg-muted/30">{me.security_question}</p>
            )}
            {showSecurityForm && (
              <div className="space-y-2 p-3 rounded-xl bg-muted/30">
                <Input
                  type="password" placeholder="Mot de passe actuel" value={securityPassword}
                  onChange={e => setSecurityPassword(e.target.value)} className="h-10"
                />
                <Input
                  placeholder="Ta question (ex: nom de mon premier animal ?)" value={securityQuestion}
                  onChange={e => setSecurityQuestion(e.target.value)} className="h-10"
                />
                <Input
                  placeholder="Ta réponse" value={securityAnswer}
                  onChange={e => setSecurityAnswer(e.target.value)} className="h-10"
                />
                {securityError && <p className="text-xs font-bold text-destructive bg-destructive/10 rounded-lg p-2">{securityError}</p>}
                <Button type="button" onClick={handleSetSecurityQuestion} disabled={savingSecurity} className="w-full h-10 rounded-lg font-bold text-sm">
                  {savingSecurity ? 'Enregistrement...' : 'Enregistrer la question'}
                </Button>
              </div>
            )}
            {securitySuccess && <p className="text-xs font-bold text-green-600 bg-green-500/10 rounded-lg p-2">Question de sécurité enregistrée.</p>}
          </div>
        </div>
      </Card>
    </div>
  )
}
