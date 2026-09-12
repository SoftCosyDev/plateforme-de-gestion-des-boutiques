'use client' // Hooks React (useQuery/useMutation) — ne s'exécutent que côté client.

// useMutation/useQuery/useQueryClient : briques TanStack Query pour lire/écrire l'API.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
// api : instance axios centralisée (token, 401 -> logout). fetchAllPages : déroule la pagination DRF.
import api, { fetchAllPages } from '@/lib/api'
// FeatureKey : les clés qu'une boutique peut activer (miroir exact du backend).
import { FeatureKey } from '@/lib/features'

// Réglages d'une boutique — toujours reçus imbriqués dans `ApiBoutique.settings`, jamais
// récupérés seuls (pas d'endpoint de liste), mais modifiés via leur propre route (voir plus bas).
export interface ApiBoutiqueSettings {
  id: number // Identifiant de LA LIGNE de réglages (pas celui de la boutique) — sert au PATCH.
  low_stock_threshold: number // Seuil "stock faible" (entier, pas un Decimal côté backend).
  critical_stock_threshold: number // Seuil "stock critique".
  notify_low_stock: boolean // Notifications de stock faible activées ou non.
  notify_system_updates: boolean // Notifications de mise à jour système activées ou non.
  notify_weekly_report: boolean // Envoi du rapport hebdomadaire activé ou non.
}

// Forme exacte renvoyée par `GET /boutiques/` et `GET /boutiques/{id}/`.
export interface ApiBoutique {
  id: number // Identifiant réel de la boutique (plus jamais un id mock en chaîne).
  owner: number // Id du compte OWNER propriétaire.
  name: string // Nom commercial affiché partout.
  neighborhood: string // Quartier/adresse — texte libre.
  theme_primary_color: string // Couleur principale du thème (hex, ex: "#1F6E5C").
  theme_accent_color: string // Couleur d'accent du thème (hex).
  business_type: string // Type d'activité — texte libre, purement informatif.
  enabled_features: FeatureKey[] // Fonctionnalités auxquelles cette boutique a souscrit.
  // Noms des attributs utilisés pour distinguer les variantes d'un produit dans CETTE boutique
  // (ex: ["Taille","Couleur"] pour une boutique de mode, ["Format"] pour une épicerie) — définis
  // librement par le propriétaire (voir /settings), jamais figés globalement pour la plateforme.
  variant_attributes: string[]
  // Abonnement actif ou non — une boutique désactivée n'a plus AUCUNE page accessible pour son
  // propriétaire/ses employés (voir access.ts), mais ses données restent intactes. Seul un
  // SUPERADMIN peut faire varier ce champ (voir BoutiqueWriteSerializer.validate côté backend).
  is_active: boolean
  settings: ApiBoutiqueSettings // Réglages imbriqués — toujours présents (créés avec la boutique).
  created_at: string // Date de création (ISO), utile pour trier par ancienneté.
}

// Payload envoyé pour créer/modifier une boutique elle-même — jamais `settings` ni `created_at`
// (ceux-ci passent par leur propre endpoint / sont calculés côté serveur).
export interface BoutiqueInput {
  owner?: number // Facultatif pour un OWNER (forcé à lui-même côté serveur) ; obligatoire pour un SuperAdmin en création.
  name: string
  neighborhood: string
  theme_primary_color: string
  theme_accent_color: string
  business_type: string
  enabled_features: FeatureKey[]
  variant_attributes?: string[] // Facultatif : librement modifiable par l'Owner lui-même.
}

// Liste toutes les boutiques visibles pour la session en cours — cloisonnement déjà appliqué
// côté serveur (OWNER: les siennes, SUPERADMIN: toutes, EMPLOYEE: la sienne uniquement).
export function useBoutiques() {
  return useQuery({
    queryKey: ['boutiques'], // Clé de cache — invalidée par toutes les mutations ci-dessous.
    queryFn: () => fetchAllPages<ApiBoutique>('/boutiques/'), // Déroule la pagination DRF au besoin.
  })
}

// Récupère UNE boutique précise (ex: la boutique "active" d'un employé ou d'un owner) — `null`
// désactive la requête (aucune boutique sélectionnée pour l'instant).
export function useBoutique(boutiqueId: number | null) {
  return useQuery({
    queryKey: ['boutique', boutiqueId], // Clé distincte par id, pour ne jamais mélanger les caches.
    queryFn: () => api.get<ApiBoutique>(`/boutiques/${boutiqueId}/`).then(res => res.data),
    enabled: boutiqueId != null, // Ne part en requête que si un id réel est fourni.
  })
}

// Crée une nouvelle boutique — `BoutiqueSettings` est auto-créée côté serveur dans la foulée
// (voir `BoutiqueViewSet.perform_create`), donc rien à faire de plus ici.
export function useCreateBoutique() {
  const queryClient = useQueryClient() // Pour invalider le cache après succès.
  return useMutation({
    mutationFn: (input: BoutiqueInput) => api.post<ApiBoutique>('/boutiques/', input).then(res => res.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['boutiques'] }), // Reflète la nouvelle boutique dans la liste.
  })
}

// Modifie une boutique existante — sert aussi bien à changer son nom/thème qu'à cocher/décocher
// ses `enabled_features` (l'écran d'admin envoie toujours l'objet complet, pas un diff partiel).
export function useUpdateBoutique() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: BoutiqueInput }) =>
      api.patch<ApiBoutique>(`/boutiques/${id}/`, input).then(res => res.data),
    onSuccess: (_data, variables) => {
      // Invalide la liste ET la fiche individuelle (si quelqu'un l'a déjà en cache).
      queryClient.invalidateQueries({ queryKey: ['boutiques'] })
      queryClient.invalidateQueries({ queryKey: ['boutique', variables.id] })
    },
  })
}

// Active/désactive une boutique — action séparée de `useUpdateBoutique` (qui ne touche jamais
// `is_active`) car réservée au SUPERADMIN et volontairement isolée pour ne jamais se glisser par
// accident dans une modification de nom/thème/fonctionnalités par un OWNER.
export function useSetBoutiqueActive() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      api.patch<ApiBoutique>(`/boutiques/${id}/`, { is_active: isActive }).then(res => res.data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['boutiques'] })
      queryClient.invalidateQueries({ queryKey: ['boutique', variables.id] })
    },
  })
}

// Modifie UNIQUEMENT `variant_attributes` — action isolée (comme useSetBoutiqueActive) plutôt que
// de passer par useUpdateBoutique, qui exige tous les champs du formulaire complet d'admin alors
// que ceci se pilote depuis /settings, un écran totalement séparé.
export function useUpdateVariantAttributes() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, variantAttributes }: { id: number; variantAttributes: string[] }) =>
      api.patch<ApiBoutique>(`/boutiques/${id}/`, { variant_attributes: variantAttributes }).then(res => res.data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['boutiques'] })
      queryClient.invalidateQueries({ queryKey: ['boutique', variables.id] })
    },
  })
}

// Payload de modification des réglages — jamais `id` (fixé par l'URL, pas par le corps).
export type BoutiqueSettingsInput = Partial<Omit<ApiBoutiqueSettings, 'id'>>

// Modifie les réglages d'une boutique — `settingsId` vient de `boutique.settings.id` (jamais de
// l'id de la boutique elle-même, voir le commentaire sur `ApiBoutiqueSettings.id` plus haut).
export function useUpdateBoutiqueSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ settingsId, input }: { settingsId: number; input: BoutiqueSettingsInput }) =>
      api.patch<ApiBoutiqueSettings>(`/boutique-settings/${settingsId}/`, input).then(res => res.data),
    // La boutique (settings imbriqués) doit être relue partout où elle est affichée.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['boutiques'] }),
  })
}

// Forme d'un compte OWNER telle que renvoyée par `/users/list-owners/` et `/users/create-owner/`
// — réservé au SuperAdmin (voir `accounts/permissions.py::IsSuperAdmin`).
export interface ApiOwner {
  id: number
  username: string
  full_name: string
  profile_photo: string | null
  is_active: boolean
}

// Liste tous les comptes OWNER de la plateforme — pour le sélecteur "propriétaire existant" du
// SuperAdmin à la création d'une boutique. 403 pour tout autre type de compte (vérifié côté serveur),
// donc `enabled` DOIT être mis à `false` pour une session non-SuperAdmin (jamais d'appel inutile).
export function useOwners(enabled: boolean = true) {
  return useQuery({
    queryKey: ['owners'],
    queryFn: () => api.get<ApiOwner[]>('/users/list-owners/').then(res => res.data),
    enabled,
  })
}

// Payload de création d'un NOUVEAU compte OWNER (onboarding d'un commerçant sur la plateforme).
export interface OwnerInput {
  username: string
  password: string
  full_name: string
}

export function useCreateOwner() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: OwnerInput) => api.post<ApiOwner>('/users/create-owner/', input).then(res => res.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['owners'] }), // Le nouvel owner doit apparaître dans le sélecteur.
  })
}
