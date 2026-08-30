'use client'

import { PAGES } from './pages'
import { useAuth } from './auth'
// useBoutique : relit en direct la boutique active depuis l'API (jamais depuis la session
// stockée) — un changement de `enabled_features` fait par un Owner ailleurs prend effet
// dès le prochain rendu de cette boutique, pas seulement à la reconnexion.
import { useBoutique } from './queries/boutiques'

// IMPORTANT : cette fonction renvoie des CLÉS DE FONCTIONNALITÉ (ex:
// 'cashier'), jamais des chemins de route (ex: '/cashier') — c'est la même
// devise que le backend utilise pour `allowed_pages`/`enabled_features`. Les
// consommateurs (sidebar, AuthGate) convertissent en chemin via `PAGES`
// quand ils en ont besoin pour le routing, jamais l'inverse.
//
// Modèle de permission à DEUX niveaux (voir Backend/docs/schema.md) :
// - EMPLOYEE : les deux niveaux comptent — la boutique doit avoir activé la
//   fonctionnalité (`enabled_features`, ET être elle-même abonnée : `is_active`)
//   ET l'employé doit lui-même y avoir accès (`allowed_pages`, figé à la
//   connexion — un changement fait par un Gérant ne s'applique qu'à la
//   prochaine connexion de l'employé) ;
// - OWNER et SUPERADMIN : uniquement le niveau boutique compte (`enabled_features`
//   ET `is_active`) — un SUPERADMIN qui "entre" dans une boutique voit EXACTEMENT
//   ce que son propriétaire verrait (utile pour prévisualiser/déboguer une config),
//   il ne bénéficie plus d'un accès "total" automatique une fois à l'intérieur.
//   La gestion de la boutique elle-même (modifier ses fonctionnalités, l'activer/
//   la désactiver) se fait depuis /admin, qui ne passe jamais par cette fonction.
//
// Renvoie `null` tant que la boutique active est en cours de chargement — DISTINCT d'un
// tableau vide, qui signifie "chargée, et réellement aucune fonctionnalité accessible". Sans
// cette distinction, AuthGate confondrait "en cours de chargement" avec "interdit" et
// renverrait l'utilisateur vers /admin à chaque fois qu'il entre dans une boutique (la requête
// réseau n'a simplement pas eu le temps de répondre avant le premier rendu).
export function useEffectivePages(): string[] | null {
  const { session } = useAuth()
  // Boutique à considérer : celle de l'employé, ou celle "active" pour un owner/superadmin.
  const boutiqueId = session
    ? session.kind === 'employee' ? session.boutiqueId : session.activeBoutiqueId
    : null
  // Relit la boutique en direct — `enabled: boutiqueId != null` dans useBoutique() évite l'appel si null.
  const { data: boutique, isPending } = useBoutique(boutiqueId)

  // Personne de connecté -> aucune fonctionnalité accessible (résolu, pas un chargement).
  if (!session) return []
  // Pas de boutique sélectionnée du tout -> réellement rien à afficher (résolu, pas un chargement).
  if (!boutiqueId) return []
  // Boutique sélectionnée mais pas encore reçue -> chargement en cours, pas encore de réponse.
  if (isPending || !boutique) return null
  // Boutique désactivée (abonnement coupé côté SUPERADMIN) -> plus aucune page, quel que soit
  // le compte — les données restent intactes, seul l'accès opérationnel se ferme.
  if (!boutique.is_active) return []
  // Niveau 1 : ce que LA BOUTIQUE a réellement activé.
  const enabledByBoutique = PAGES.filter(p => boutique.enabled_features.includes(p.id)).map(p => p.id)
  // EMPLOYEE : croise avec le niveau 2 (ses propres pages autorisées).
  if (session.kind === 'employee') return enabledByBoutique.filter(id => session.allowedPages.includes(id))
  // OWNER et SUPERADMIN : uniquement filtré par la boutique, pas de second niveau.
  return enabledByBoutique
}

// Id de la boutique "en cours" pour la session actuelle — celle de l'employé, ou celle
// actuellement sélectionnée par un owner/superadmin. Utilisé par CHAQUE domaine métier
// (produits, ventes, clients...) pour savoir quelle boutique envoyer sur ses créations — un
// EMPLOYEE n'en a jamais besoin pour écrire (le serveur force la sienne), mais un OWNER/
// SUPERADMIN doit toujours préciser explicitement dans quelle boutique il agit.
export function useActiveBoutiqueId(): number | null {
  const { session } = useAuth()
  if (!session) return null
  return session.kind === 'employee' ? session.boutiqueId : session.activeBoutiqueId
}
