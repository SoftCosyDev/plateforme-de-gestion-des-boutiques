import { LayoutDashboard, Package, ShoppingCart, Receipt, Users, UserCog, ClipboardList, BarChart3, Truck, PackagePlus, PackageCheck, Settings, LucideIcon } from 'lucide-react'
// `FeatureKey` : source unique des clés de fonctionnalité, miroir du backend.
import { FeatureKey } from './features'

// Une page de la sidebar : `id` est TOUJOURS une clé de `ALL_FEATURES`
// (comparée aux permissions backend), `path` est la route Next.js réelle —
// les deux ne se confondent jamais, contrairement à l'ancienne version qui
// comparait directement des chemins aux permissions.
export interface PageDef {
  id: FeatureKey // Clé de fonctionnalité (ex: 'cashier') — sert aux comparaisons de permission.
  path: string // Route Next.js réelle (ex: '/cashier') — sert uniquement au routing/affichage.
  label: string // Libellé affiché dans la sidebar.
  icon: LucideIcon // Icône affichée dans la sidebar.
}

// Source unique pour la navigation (sidebar) ET pour la grille "Pages
// autorisées" du formulaire employé — évite que les deux listes divergent.
// Certaines clés de `ALL_FEATURES` (stocks, attendance, payroll) n'ont
// toujours pas de route dédiée ici — attendance/payroll resteront des
// onglets de /employees, jamais des routes séparées.
export const PAGES: PageDef[] = [
  { id: 'dashboard', path: '/', label: 'Tableau de bord', icon: LayoutDashboard },
  { id: 'products', path: '/products', label: 'Produits', icon: Package },
  { id: 'cashier', path: '/cashier', label: 'Caisse', icon: ShoppingCart },
  { id: 'sales', path: '/sales', label: 'Ventes', icon: Receipt },
  { id: 'orders', path: '/orders', label: 'Commandes', icon: PackageCheck },
  { id: 'customers', path: '/customers', label: 'Clients', icon: Users },
  { id: 'suppliers', path: '/suppliers', label: 'Fournisseurs', icon: Truck },
  { id: 'purchases', path: '/purchases', label: 'Achats', icon: PackagePlus },
  { id: 'employees', path: '/employees', label: 'Employés', icon: UserCog },
  { id: 'inventory', path: '/inventory', label: 'Inventaire', icon: ClipboardList },
  { id: 'reports', path: '/reports', label: 'Rapports & Statistiques', icon: BarChart3 },
  { id: 'settings', path: '/settings', label: 'Réglages', icon: Settings },
]

// Calcule la première route accessible pour une liste de CLÉS de
// fonctionnalité (ex: `session.allowedPages` d'un employé réel) — jamais des
// chemins bruts, la conversion se fait ici, une seule fois.
export function homeForPages(allowedFeatureKeys: string[]): string {
  // On cherche la première page de la sidebar dont la clé est autorisée.
  const found = PAGES.find(page => allowedFeatureKeys.includes(page.id))
  // Repli par défaut : la Caisse, l'écran le plus utilisé au quotidien.
  return found?.path ?? '/cashier'
}
