// Source unique des clés de fonctionnalité — DOIT rester un miroir exact de
// `ALL_FEATURES` défini côté backend dans `Backend/employees/models.py` : ce
// sont ces mêmes chaînes qui circulent dans `Boutique.enabled_features` (côté
// boutique) et `EmployeeProfile.allowed_pages` (côté employé) via l'API.
export const ALL_FEATURES = [
  'dashboard', // Tableau de bord
  'products', // Produits (catalogue, variantes, stock affiché)
  'stocks', // Mouvements de stock (pas encore de route dédiée côté frontend)
  'cashier', // Caisse (vente au comptoir)
  'sales', // Historique des ventes (pas encore de route dédiée)
  'orders', // Commandes (site web / application)
  'customers', // Clients et ardoise
  'employees', // Gestion des employés
  'attendance', // Absences et retards (onglet de la page Employés)
  'payroll', // Paie (onglet de la page Employés)
  'inventory', // Inventaire physique
  'suppliers', // Fournisseurs
  'purchases', // Achats fournisseurs
  'reports', // Rapports et statistiques
  'settings', // Réglages de la boutique
] as const

// Type dérivé automatiquement de la liste ci-dessus — garantit qu'on ne peut
// jamais écrire une clé de fonctionnalité qui n'existe pas côté backend.
export type FeatureKey = typeof ALL_FEATURES[number]

// Rôle d'accès d'un employé — miroir exact de `AccessRole` côté backend
// (`Backend/employees/models.py`), remplace l'ancien gerant/caissier/vendeur.
export type AccessRole = 'gerant' | 'manager' | 'staff'

// Gabarit de pages par défaut selon le rôle choisi — miroir exact de
// `DEFAULT_PAGES_BY_ROLE` côté backend, en clés de fonctionnalité (jamais des
// chemins de route Next.js, voir `pages.ts` pour la conversion).
export const DEFAULT_PAGES_BY_ROLE: Record<AccessRole, FeatureKey[]> = {
  // Gérant : accès à absolument tout.
  gerant: [...ALL_FEATURES],
  // Manager : tout sauf la gestion des employés, la paie et les réglages.
  manager: ALL_FEATURES.filter(key => !['employees', 'payroll', 'settings'].includes(key)),
  // Staff : le strict nécessaire pour tenir un comptoir au quotidien.
  staff: ['cashier', 'products', 'customers', 'orders', 'inventory'],
}
