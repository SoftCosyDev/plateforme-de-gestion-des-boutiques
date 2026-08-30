'use client'

import React, { useEffect, useState } from 'react'
import { X, Save } from 'lucide-react'
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
            <Avatar className="size-11">
              <AvatarImage src={me.profile_photo ?? undefined} alt={me.full_name} />
              <AvatarFallback className="font-bold">{initials(me.full_name)}</AvatarFallback>
            </Avatar>
            <div>
              <p className="font-bold">{me.full_name}</p>
              <Badge variant="outline" className="text-[10px] mt-1">{roleLabel}</Badge>
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
              <label className="text-[10px] font-bold text-muted-foreground uppercase">Mot de passe actuel</label>
              <Input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} className="h-10" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Nouveau</label>
                <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="h-10" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Confirmer</label>
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
      </Card>
    </div>
  )
}
