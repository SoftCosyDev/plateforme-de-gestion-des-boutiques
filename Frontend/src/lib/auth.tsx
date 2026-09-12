'use client'

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
// usePathname : pour ne JAMAIS afficher l'écran de verrouillage sur /login (voir plus bas) —
// une session/verrou resté en localStorage ne doit jamais bloquer un nouvel essai de connexion.
import { usePathname } from 'next/navigation'
import api from './api'
import { queryClient } from './queryClient'
import { useIdleTimer } from './use-idle-timer'
import LockOverlay from '@/components/lock-overlay'
// Clés localStorage — dans leur propre module pour qu'api.ts puisse aussi les nettoyer sur un
// 401, sans import circulaire (voir auth-storage.ts).
import { LOCK_KEY, SESSION_KEY, TOKEN_KEY } from './auth-storage'

// 30 minutes d'inactivité -> verrouillage automatique (voir useIdleTimer ci-dessous).
const IDLE_TIMEOUT_MS = 30 * 60 * 1000

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
  // Verrouillage par inactivité (30 min, voir useIdleTimer) — jamais une déconnexion : le jeton
  // reste valide, seule l'INTERFACE se bloque tant que `unlock()` n'a pas confirmé le bon code.
  isLocked: boolean
  lock: () => void
  // Rejette si le code (PIN ou mot de passe complet, voir UnlockSerializer côté backend) est
  // incorrect — l'appelant (LockOverlay) lit `error.response.data` pour le message.
  unlock: (pin: string) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

// Session volontairement séparée du store métier (localStorage propre) : un
// "Réinitialiser les données de démo" ne doit pas déconnecter l'utilisateur.
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const [isLocked, setIsLocked] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY)
      if (raw) setSession(JSON.parse(raw))
      // Restaure aussi l'état verrouillé — voir le commentaire sur LOCK_KEY plus haut.
      setIsLocked(localStorage.getItem(LOCK_KEY) === '1')
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

  useEffect(() => {
    if (!hydrated) return
    try {
      if (isLocked) localStorage.setItem(LOCK_KEY, '1')
      else localStorage.removeItem(LOCK_KEY)
    } catch {
      // stockage indisponible : le verrouillage reste valide pour cet onglet seulement
    }
  }, [isLocked, hydrated])

  // Fonctions stables (useCallback) : passées à useIdleTimer, qui réinstallerait sinon ses
  // écouteurs — et donc réinitialiserait le minuteur d'inactivité — à chaque rendu du Provider.
  const lock = useCallback(() => setIsLocked(true), [])
  const unlock = useCallback(async (pin: string) => {
    // Ne fait AUCUNE hypothèse locale : le serveur seul valide le code (PIN ou mot de passe,
    // voir UnlockSerializer) — lève une erreur si incorrect, laissée à l'appelant (LockOverlay).
    await api.post('/users/unlock/', { pin })
    setIsLocked(false)
  }, [])

  // 30 minutes sans la moindre activité -> verrouillage automatique — jamais actif tant que
  // personne n'est connecté, ni une fois déjà verrouillé (rien à surveiller de plus à ce stade).
  useIdleTimer(!!session && !isLocked, IDLE_TIMEOUT_MS, lock)

  const login = async (username: string, password: string): Promise<Session> => {
    const res = await api.post<LoginResponse>('/token/', { username: username.trim(), password })
    const data = res.data
    localStorage.setItem(TOKEN_KEY, data.token)
    // Vide tout le cache TanStack Query AVANT d'installer la nouvelle session — sans ça, une
    // requête encore "fraîche" (staleTime 5 min, voir queryClient.ts) faite par le compte
    // PRÉCÉDENT reste servie telle quelle au nouveau compte tant qu'elle n'expire pas (ex: un
    // OWNER qui se connecte juste après un SUPERADMIN verrait encore TOUTES les boutiques de la
    // plateforme, pas seulement les siennes, jusqu'à ce que le cache expire de lui-même).
    queryClient.clear()
    // Une nouvelle connexion démarre toujours déverrouillée, même si l'onglet était resté
    // verrouillé par un compte précédent sur ce même appareil.
    setIsLocked(false)

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
    // Invalide le jeton CÔTÉ SERVEUR (voir accounts/views.py::LogoutView) — jusqu'ici "se
    // déconnecter" ne faisait que vider le stockage local, le jeton restait valide indéfiniment
    // et rejouable par quiconque l'aurait intercepté. Appelée AVANT de retirer le jeton du
    // localStorage (l'intercepteur de `api` le lit à cet instant précis pour l'en-tête
    // Authorization) mais jamais attendue : la déconnexion locale ne doit jamais dépendre du
    // réseau (l'utilisateur doit pouvoir se déconnecter même hors ligne).
    api.post('/logout/').catch(() => {})
    localStorage.removeItem(TOKEN_KEY)
    setSession(null)
    // Pas de session -> pas de verrou à garder (voir aussi useIdleTimer, désactivé sans session).
    setIsLocked(false)
    // Même raison qu'au login : ne laisse aucune donnée du compte qui se déconnecte traîner en
    // cache pour le prochain qui se connectera sur cet appareil.
    queryClient.clear()
  }

  // Réservé aux sessions owner/superadmin : "entrer" dans une boutique (id
  // numérique réel, voir `useBoutiques()`) ou en ressortir avec `null`, pour
  // revenir à l'écran "Mes boutiques".
  const setActiveBoutique = (boutiqueId: number | null) => {
    setSession(prev => (prev && prev.kind !== 'employee' ? { ...prev, activeBoutiqueId: boutiqueId } : prev))
  }

  return (
    <AuthContext.Provider value={{ session, hydrated, login, logout, setActiveBoutique, isLocked, lock, unlock }}>
      {children}
      {/* Rendu ici (au-dessus de tout, y compris /admin) plutôt que dans AuthGate/AppShell —
          ces derniers ne couvrent que les pages du shell employé/owner, jamais /admin.
          `pathname !== '/login'` est CAPITAL : une session/verrou resté dans le localStorage
          (jeton expiré côté serveur, ancien onglet jamais fermé proprement...) ne doit JAMAIS
          pouvoir recouvrir l'écran de connexion et empêcher un nouvel essai — /login doit
          toujours rester utilisable, quoi qu'il traîne en local. */}
      {hydrated && session && isLocked && pathname !== '/login' && (
        <LockOverlay session={session} onUnlock={unlock} onLogout={logout} />
      )}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth doit être utilisé à l\'intérieur de AuthProvider')
  return ctx
}
