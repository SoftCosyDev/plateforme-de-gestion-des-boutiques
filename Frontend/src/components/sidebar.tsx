'use client'

import { useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Menu, X, Store, LogOut, Building2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useAuth } from '@/lib/auth'
import { useEffectivePages } from '@/lib/access'
import { PAGES } from '@/lib/pages'
// useBoutique : remplace la recherche dans le mock pour le nom/quartier affichés en en-tête.
import { useBoutique } from '@/lib/queries/boutiques'
import { ACCESS_ROLE_LABELS } from '@/lib/types'
import { initials } from '@/lib/utils'
import ProfileModal from '@/components/profile-modal'

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const { session, logout, setActiveBoutique } = useAuth()
  const allowedPages = useEffectivePages()

  const isActive = (route: string) => pathname === route
  // `allowedPages` contient des CLÉS de fonctionnalité (ex: 'cashier'), donc
  // on compare sur `item.id`, jamais sur `item.path` (voir access.ts). `null`
  // = boutique encore en cours de chargement -> rien à afficher pour l'instant.
  const visibleItems = allowedPages ? PAGES.filter(item => allowedPages.includes(item.id)) : []

  // Id numérique réel dans les deux cas (employé ou owner/superadmin actif).
  const currentBoutiqueId = session
    ? session.kind === 'employee' ? session.boutiqueId : session.activeBoutiqueId
    : null
  const { data: currentBoutique } = useBoutique(currentBoutiqueId)

  const sessionRoleLabel = session?.kind === 'employee'
    ? ACCESS_ROLE_LABELS[session.accessRole as keyof typeof ACCESS_ROLE_LABELS] ?? session.accessRole
    : session?.kind === 'owner' ? 'Propriétaire'
    : session?.kind === 'superadmin' ? 'Super Administrateur'
    : ''

  const handleLogout = () => {
    logout()
    setIsOpen(false)
    router.replace('/login')
  }

  const handleBackToBoutiques = () => {
    setActiveBoutique(null)
    setIsOpen(false)
    router.push('/admin')
  }

  const content = (
    <div className="flex flex-col h-full">
      {/* En-tête : logo + nom boutique (dynamique par boutique) */}
      <div className="flex items-center gap-2 h-16 px-4 border-b border-sidebar-border">
        <div className="w-9 h-9 rounded-xl bg-sidebar-primary flex items-center justify-center shrink-0">
          <Store className="w-5 h-5 text-sidebar-primary-foreground" />
        </div>
        <div className="min-w-0">
          <p className="font-black text-sidebar-foreground leading-tight truncate">{currentBoutique?.name || 'Chez Idrissou'}</p>
          <p className="text-[10px] text-sidebar-foreground/60 uppercase tracking-widest truncate">{currentBoutique?.neighborhood || 'Boutique'}</p>
        </div>
      </div>

      {/* Session en cours — cliquable pour éditer son propre profil */}
      {session && (
        <button
          type="button"
          onClick={() => setIsProfileOpen(true)}
          className="flex items-center gap-2.5 px-4 py-3 border-b border-sidebar-border hover:bg-sidebar-accent/10 transition-colors text-left"
        >
          <Avatar className="size-9 shrink-0">
            <AvatarImage src={session.profilePhoto ?? undefined} alt={session.name} />
            <AvatarFallback className="text-xs font-bold">{initials(session.name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-sidebar-foreground truncate">{session.name}</p>
            <p className="text-[10px] text-sidebar-foreground/60 uppercase tracking-wide font-bold">
              {sessionRoleLabel}
            </p>
          </div>
          <span
            role="button"
            tabIndex={0}
            onClick={e => { e.stopPropagation(); handleLogout() }}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); handleLogout() } }}
            title="Déconnexion"
            className="p-2 rounded-lg text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/10 transition-colors shrink-0"
          >
            <LogOut className="w-4 h-4" />
          </span>
        </button>
      )}

      {/* Retour à la liste des boutiques (comptes propriétaire/super admin) */}
      {session && session.kind !== 'employee' && (
        <button
          onClick={handleBackToBoutiques}
          className="flex items-center gap-2 px-4 py-3 text-xs font-bold text-sidebar-foreground/70 hover:text-sidebar-foreground border-b border-sidebar-border hover:bg-sidebar-accent/10 transition-colors"
        >
          <Building2 className="w-3.5 h-3.5" />
          ← Mes boutiques
        </button>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-6 space-y-1.5">
        {visibleItems.map((item) => {
          const Icon = item.icon
          const active = isActive(item.path)
          return (
            <Button
              key={item.id}
              variant={active ? 'default' : 'ghost'}
              className={`w-full justify-start gap-3 text-base ${
                active
                  ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent/20 hover:text-sidebar-foreground'
              }`}
              onClick={() => {
                router.push(item.path)
                setIsOpen(false)
              }}
            >
              <Icon className="w-5 h-5" />
              <span>{item.label}</span>
            </Button>
          )
        })}
      </nav>
    </div>
  )

  return (
    <>
      {/* Bouton mobile */}
      <button
        onClick={() => setIsOpen(true)}
        className="md:hidden fixed top-4 left-4 z-30 w-10 h-10 rounded-xl bg-sidebar border border-sidebar-border flex items-center justify-center shadow-lg"
      >
        <Menu className="w-5 h-5 text-sidebar-foreground" />
      </button>

      {/* Overlay mobile */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/50 z-30 md:hidden" onClick={() => setIsOpen(false)} />
      )}

      <aside
        className={`fixed md:static inset-y-0 left-0 w-64 bg-sidebar border-r border-sidebar-border transform transition-transform duration-300 z-40 ${
          isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        {isOpen && (
          <button
            onClick={() => setIsOpen(false)}
            className="md:hidden absolute top-4 right-4 text-sidebar-foreground"
          >
            <X className="w-5 h-5" />
          </button>
        )}
        {content}
      </aside>

      {isProfileOpen && <ProfileModal onClose={() => setIsProfileOpen(false)} />}
    </>
  )
}
