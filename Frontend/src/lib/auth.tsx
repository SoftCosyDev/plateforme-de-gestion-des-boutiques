'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'
import api from './api'

// v4 : authentification réelle contre le backend Django (POST /token/) —
// remplace la recherche en clair dans les tableaux mock. Bump de la clé de
// session car sa forme change (identifiants numériques, plus d'emoji).
const SESSION_KEY = 'chez-idrissou-session-v4'
const TOKEN_KEY = 'authToken'

// `activeBoutiqueId` est maintenant un vrai id numérique de `Boutique` (API) —
// `admin/page.tsx` le fixe désormais depuis `useBoutiques()` (réel), plus
// depuis des ids mock en chaîne. Les DONNÉES de la boutique (thème, features,
// nom...) ne sont volontairement PAS stockées ici : elles sont relues en
// direct via `useBoutique(activeBoutiqueId)` partout où c'est nécessaire, pour
// qu'un changement de fonctionnalités prenne effet sans devoir se reconnecter.
export type Session =
  | {
      kind: 'employee'; employeeId: number; boutiqueId: number; name: string
      profilePhoto: string | null; accessRole: string; allowedPages: string[]
    }
  | { kind: 'owner'; ownerId: number; activeBoutiqueId: number | null; name: string; profilePhoto: string | null }
  | { kind: 'superadmin'; superAdminId: number; activeBoutiqueId: number | null; name: string; profilePhoto: string | null }

interface LoginResponse {
  token: string
  id: number
  username: string
  full_name: string
  account_type: 'SUPERADMIN' | 'OWNER' | 'EMPLOYEE'
  profile_photo: string | null
  boutique_id?: number
  allowed_pages?: string[]
  access_role?: string
}

interface AuthContextValue {
  session: Session | null
  hydrated: boolean
  // Rejette (throw) si l'identifiant ou le mot de passe est incorrect —
  // l'appelant lit `error.response.data` pour le message (voir login/page.tsx).
  login: (username: string, password: string) => Promise<Session>
  logout: () => void
  setActiveBoutique: (boutiqueId: number | null) => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

// Session volontairement séparée du store métier (localStorage propre) : un
// "Réinitialiser les données de démo" ne doit pas déconnecter l'utilisateur.
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY)
      if (raw) setSession(JSON.parse(raw))
    } catch {
      // session corrompue -> repart déconnecté
    }
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    try {
      if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session))
      else localStorage.removeItem(SESSION_KEY)
    } catch {
      // stockage indisponible : la session reste valide pour cet onglet seulement
    }
  }, [session, hydrated])

  const login = async (username: string, password: string): Promise<Session> => {
    const res = await api.post<LoginResponse>('/token/', { username: username.trim(), password })
    const data = res.data
    localStorage.setItem(TOKEN_KEY, data.token)

    const next: Session =
      data.account_type === 'SUPERADMIN'
        ? { kind: 'superadmin', superAdminId: data.id, name: data.full_name, profilePhoto: data.profile_photo, activeBoutiqueId: null }
        : data.account_type === 'OWNER'
        ? { kind: 'owner', ownerId: data.id, name: data.full_name, profilePhoto: data.profile_photo, activeBoutiqueId: null }
        : {
            kind: 'employee',
            employeeId: data.id,
            boutiqueId: data.boutique_id as number,
            name: data.full_name,
            profilePhoto: data.profile_photo,
            // Repli 'staff' (le rôle le plus restrictif) — l'ancien repli
            // 'vendeur' n'existe plus côté backend (gerant/manager/staff).
            accessRole: data.access_role ?? 'staff',
            allowedPages: data.allowed_pages ?? [],
          }

    setSession(next)
    return next
  }

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY)
    setSession(null)
  }

  // Réservé aux sessions owner/superadmin : "entrer" dans une boutique (id
  // numérique réel, voir `useBoutiques()`) ou en ressortir avec `null`, pour
  // revenir à l'écran "Mes boutiques".
  const setActiveBoutique = (boutiqueId: number | null) => {
    setSession(prev => (prev && prev.kind !== 'employee' ? { ...prev, activeBoutiqueId: boutiqueId } : prev))
  }

  return (
    <AuthContext.Provider value={{ session, hydrated, login, logout, setActiveBoutique }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth doit être utilisé à l\'intérieur de AuthProvider')
  return ctx
}
