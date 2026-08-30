'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { useEffectivePages } from '@/lib/access'
import { PAGES, homeForPages } from '@/lib/pages'
import { applyBoutiqueTheme, clearBoutiqueTheme } from '@/lib/boutique-theme'
// useBoutique : relit la vraie boutique (thème inclus) depuis l'API.
import { useBoutique } from '@/lib/queries/boutiques'

// Protège toutes les pages du shell (sidebar) : redirige vers /login si
// personne n'est connecté, vers /admin si un propriétaire/super admin n'a pas
// encore choisi de boutique, ou vers la première page autorisée si la page
// demandée n'en fait pas partie (ex: un employé sans accès Employés qui tape
// /employees dans l'URL).
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { session, hydrated } = useAuth()
  const pages = useEffectivePages()
  const pathname = usePathname()
  const router = useRouter()

  // `pages` contient des CLÉS de fonctionnalité (ex: 'cashier'), pas des
  // chemins — on retrouve d'abord la page correspondant à l'URL courante,
  // puis on vérifie si SA clé fait partie des fonctionnalités autorisées.
  // `pages === null` : la boutique active est encore en cours de chargement — on
  // n'affiche rien de définitif tant qu'on ne sait pas vraiment (voir access.ts).
  const currentPage = PAGES.find(p => p.path === pathname)
  const allowed = pages !== null && currentPage ? pages.includes(currentPage.id) : false

  // Id numérique réel dans les deux cas désormais — plus de coercion `String(...)` nécessaire.
  const boutiqueId = session
    ? session.kind === 'employee' ? session.boutiqueId : session.activeBoutiqueId
    : null
  const { data: boutique } = useBoutique(boutiqueId)

  useEffect(() => {
    if (!hydrated) return
    if (!session) {
      router.replace('/login')
      return
    }
    if (session.kind !== 'employee' && !session.activeBoutiqueId) {
      router.replace('/admin')
      return
    }
    // Encore en cours de chargement -> on ne décide RIEN pour l'instant, surtout pas de
    // redirection vers /admin (ce serait confondre "pas encore su" avec "refusé").
    if (pages === null) return
    if (!currentPage || !pages.includes(currentPage.id)) {
      router.replace(pages.length > 0 ? homeForPages(pages) : '/admin')
    }
  }, [hydrated, session, pages, currentPage, router])

  // Applique la couleur de la boutique courante (sidebar comprise) une fois
  // connu ; revient au thème par défaut si on quitte le contexte d'une
  // boutique (ex: admin qui retourne à /admin).
  useEffect(() => {
    // Convertit les champs plats du backend (hex) au format `{primary, accent}` attendu ici.
    if (boutique) applyBoutiqueTheme({ primary: boutique.theme_primary_color, accent: boutique.theme_accent_color })
    else clearBoutiqueTheme()
    return () => clearBoutiqueTheme()
  }, [boutique])

  // Avant l'hydratation (le serveur ne connaît jamais la session en
  // localStorage) on affiche un état neutre identique des deux côtés, pour
  // éviter toute erreur d'hydratation — le contenu réel n'apparaît qu'une
  // fois la session vérifiée côté client.
  if (!hydrated || !allowed) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground text-sm font-medium">
        Chargement...
      </div>
    )
  }

  return <>{children}</>
}
