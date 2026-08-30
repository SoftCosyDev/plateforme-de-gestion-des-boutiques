'use client' // Hooks React (useQuery/useMutation) — ne s'exécutent que côté client.

// useMutation/useQuery/useQueryClient : briques TanStack Query pour lire/écrire l'API.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
// api : instance axios centralisée. fetchAllPages : déroule la pagination DRF.
import api, { fetchAllPages } from '@/lib/api'
// useActiveBoutiqueId : id de la boutique "en cours" pour la session (voir access.ts).
import { useActiveBoutiqueId } from '@/lib/access'

export type Unit = 'unite' | 'kg' | 'g' | 'l' | 'cl' | 'carton' | 'sachet'

// Catégorie — désormais propre à CHAQUE boutique côté backend (plus globale).
export interface ApiCategory {
  id: number
  boutique: number
  name: string
  description: string
  image_url: string
}

// Forme brute du stock telle que renvoyée par l'API (Decimal -> chaînes).
interface RawStock {
  id: number // Indispensable pour poser ensuite un StockMovement ciblant cette ligne précise.
  on_hand_qty: string
  reserved_qty: string
  available_qty: string
  last_counted_at: string | null
}

// Forme convertie (nombres réels) — celle manipulée partout dans l'UI.
export interface ApiStock {
  id: number
  onHandQty: number
  reservedQty: number
  availableQty: number
  lastCountedAt: string | null
}

// Forme brute d'UNE variante — telle que reçue depuis l'API (imbriquée dans un produit).
interface RawVariant {
  id: number
  product: number
  sku: string // Auto-généré côté serveur, jamais saisi par l'utilisateur.
  barcode: string
  model: string
  size: string
  selling_price: string
  cost_price: string
  low_stock_threshold: string | null
  attributes: Record<string, unknown>
  is_active: boolean
  stock: RawStock
}

// Forme convertie d'une variante.
export interface ApiVariant {
  id: number
  sku: string
  barcode: string
  model: string
  size: string
  sellingPrice: number
  costPrice: number
  lowStockThreshold: number
  attributes: Record<string, unknown>
  isActive: boolean
  stock: ApiStock
}

// Convertit une variante brute (Decimal en chaînes) vers sa forme numérique exploitable.
function mapVariant(raw: RawVariant): ApiVariant {
  return {
    id: raw.id,
    sku: raw.sku,
    barcode: raw.barcode,
    model: raw.model,
    size: raw.size,
    sellingPrice: Number(raw.selling_price),
    costPrice: Number(raw.cost_price),
    // `low_stock_threshold` est nullable côté backend (pas de seuil propre à cette variante).
    lowStockThreshold: raw.low_stock_threshold != null ? Number(raw.low_stock_threshold) : 0,
    attributes: raw.attributes,
    isActive: raw.is_active,
    stock: {
      id: raw.stock.id,
      onHandQty: Number(raw.stock.on_hand_qty),
      reservedQty: Number(raw.stock.reserved_qty),
      availableQty: Number(raw.stock.available_qty),
      lastCountedAt: raw.stock.last_counted_at,
    },
  }
}

// Forme brute d'un produit — `variants` imbriquées, plus de price/stock/barcode directement dessus.
interface RawProduct {
  id: number
  boutique: number
  category: ApiCategory
  name: string
  code_produit: string
  emoji: string
  is_published: boolean
  unit: Unit
  expiration_date: string | null
  variants: RawVariant[]
}

// Forme convertie d'un produit, prête pour l'UI.
export interface ApiProduct {
  id: number
  boutique: number
  category: ApiCategory
  name: string
  codeProduit: string
  emoji: string
  isPublished: boolean
  unit: Unit
  expirationDate: string | null
  variants: ApiVariant[]
}

function mapProduct(raw: RawProduct): ApiProduct {
  return {
    id: raw.id,
    boutique: raw.boutique,
    category: raw.category,
    name: raw.name,
    codeProduit: raw.code_produit,
    emoji: raw.emoji,
    isPublished: raw.is_published,
    unit: raw.unit,
    expirationDate: raw.expiration_date,
    variants: raw.variants.map(mapVariant),
  }
}

// Un produit "simple" (épicerie) se comporte comme un article mono-SKU classique via SA
// PREMIÈRE variante — un produit à déclinaisons (mode boutique) en aurait plusieurs, hors
// scope de cette UI pour l'instant (voir Backend/docs/schema.md pour le mécanisme complet).
export function getPrimaryVariant(product: ApiProduct): ApiVariant {
  return product.variants[0]
}

// `boutique` en paramètre de requête : sans lui, un SUPERADMIN/OWNER multi-boutiques recevrait
// les catégories/produits de TOUTES ses boutiques mélangés (for_user() ne filtre que "cette
// boutique appartient-elle à ce compte", jamais "est-ce CELLE actuellement affichée à l'écran").
// La clé de requête inclut boutiqueId pour que changer de boutique déclenche un vrai refetch.
export function useCategories() {
  const boutiqueId = useActiveBoutiqueId()
  return useQuery({
    queryKey: ['categories', boutiqueId],
    queryFn: () => fetchAllPages<ApiCategory>('/categories/', { boutique: boutiqueId ?? undefined }),
  })
}

export function useProducts() {
  const boutiqueId = useActiveBoutiqueId()
  return useQuery({
    queryKey: ['products', boutiqueId],
    queryFn: async () => (await fetchAllPages<RawProduct>('/products/', { boutique: boutiqueId ?? undefined })).map(mapProduct),
  })
}

// Champs collectés par le formulaire mono-article — poste UNE seule variante imbriquée (le
// backend, lui, accepte un tableau complet, voir catalog/serializers.py::ProductWriteSerializer).
export interface ProductInput {
  category: number
  name: string
  unit: Unit
  expirationDate: string | null
  emoji: string
  variant: {
    // Présent = met à jour CETTE variante existante ; absent = le serveur en crée une nouvelle.
    // TOUJOURS fournir l'id à la modification, sous peine que le serveur supprime l'ancienne
    // variante (et son stock !) pour en recréer une neuve à zéro (voir la logique d'update()).
    id?: number
    barcode: string
    sellingPrice: number
    costPrice: number
    lowStockThreshold: number
  }
}

function toApiPayload(input: ProductInput, boutiqueId: number | null) {
  return {
    boutique: boutiqueId ?? undefined, // undefined -> absent du JSON (le serveur le force pour un EMPLOYEE).
    category: input.category,
    name: input.name,
    unit: input.unit,
    expiration_date: input.expirationDate,
    emoji: input.emoji,
    variants: [{
      id: input.variant.id,
      barcode: input.variant.barcode,
      selling_price: input.variant.sellingPrice,
      cost_price: input.variant.costPrice,
      low_stock_threshold: input.variant.lowStockThreshold,
    }],
  }
}

export function useCreateProduct() {
  const queryClient = useQueryClient()
  const boutiqueId = useActiveBoutiqueId()
  return useMutation({
    mutationFn: async (input: ProductInput) =>
      mapProduct((await api.post<RawProduct>('/products/', toApiPayload(input, boutiqueId))).data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['products'] }),
  })
}

export function useUpdateProduct() {
  const queryClient = useQueryClient()
  const boutiqueId = useActiveBoutiqueId()
  return useMutation({
    mutationFn: async ({ id, input }: { id: number; input: ProductInput }) =>
      mapProduct((await api.patch<RawProduct>(`/products/${id}/`, toApiPayload(input, boutiqueId))).data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['products'] }),
  })
}

export function useDeleteProduct() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.delete(`/products/${id}/`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['products'] }),
  })
}

// Les 16 raisons possibles pour un mouvement de stock — miroir EXACT de `StockMovement.Reason`
// côté backend (Backend/stock/models.py) : le serveur rejette toute autre valeur.
export const STOCK_MOVEMENT_REASONS = [
  { value: 'STOCK_INITIAL', label: 'Stock initial (création produit)' },
  { value: 'COMMANDE_LIVREE', label: 'Commande livrée' },
  { value: 'ACHAT_FOURNISSEUR', label: 'Achat fournisseur' },
  { value: 'RETOUR_TEST', label: 'Retour de test' },
  { value: 'CORRECTION_INVENTAIRE', label: 'Correction inventaire' },
  { value: 'CADEAU_PROMO', label: 'Cadeau/Promotion' },
  { value: 'VENTE', label: 'Vente' },
  { value: 'SORTIE_MAGASIN', label: 'Sortie magasin' },
  { value: 'CASSE_PERTE', label: 'Casse/Perte' },
  { value: 'ECHANTILLON', label: 'Échantillon' },
  { value: 'INVENTAIRE_ANNUEL', label: 'Inventaire annuel' },
  { value: 'CORRECTION_MANUELLE', label: 'Correction manuelle' },
  { value: 'PEREMPTION', label: 'Péremption' },
  { value: 'RETOUR_CLIENT', label: 'Retour client' },
  { value: 'REMBOURSEMENT', label: 'Remboursement' },
  { value: 'AUTRE', label: 'Autre' },
] as const

export type StockMovementReason = typeof STOCK_MOVEMENT_REASONS[number]['value']

// Pose un mouvement MANUEL de stock — `diff` est SIGNÉ (positif = entrée, négatif = sortie),
// voir `StockMovement.quantite` côté backend. `stockId` vient toujours de `variant.stock.id`
// (jamais de l'id du produit ni de la variante elle-même).
export function useAdjustStock() {
  const queryClient = useQueryClient()
  const boutiqueId = useActiveBoutiqueId()
  return useMutation({
    mutationFn: ({ stockId, diff, reason }: { stockId: number; diff: number; reason: StockMovementReason }) =>
      api.post('/stock-movements/', {
        boutique: boutiqueId ?? undefined,
        stock: stockId,
        movement_type: diff >= 0 ? 'ENTREE' : 'SORTIE',
        quantite: diff,
        reason,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['products'] }),
  })
}
