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
  selling_price: string
  cost_price: string
  low_stock_threshold: string | null
  // Valeurs des attributs de déclinaison PROPRES à la boutique (ex: {"Taille":"M","Couleur":
  // "Rouge"}) — les clés possibles sont Boutique.variant_attributes, définies dans /settings.
  // Toujours du texte : le formulaire ne collecte que des champs texte, jamais autre chose.
  attributes: Record<string, string>
  is_active: boolean
  stock: RawStock
}

// Forme convertie d'une variante.
export interface ApiVariant {
  id: number
  sku: string
  barcode: string
  sellingPrice: number
  costPrice: number
  lowStockThreshold: number
  attributes: Record<string, string>
  isActive: boolean
  stock: ApiStock
}

// Convertit une variante brute (Decimal en chaînes) vers sa forme numérique exploitable.
function mapVariant(raw: RawVariant): ApiVariant {
  return {
    id: raw.id,
    sku: raw.sku,
    barcode: raw.barcode,
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
  // URL absolue (voir ProductSerializer, context={'request'} côté backend) ou null tant
  // qu'aucune photo n'a été uploadée (voir useUploadProductImage) — l'emoji reste alors l'affichage.
  image: string | null
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
  image: string | null
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
    image: raw.image,
    isPublished: raw.is_published,
    unit: raw.unit,
    expirationDate: raw.expiration_date,
    variants: raw.variants.map(mapVariant),
  }
}

// Une variante "à plat", accompagnée de son produit parent — la vraie unité vendable/comptable
// dès qu'un produit a plusieurs déclinaisons (taille/couleur/modèle). Utilisé par la Caisse, les
// Commandes, les Achats et l'Inventaire pour rechercher/choisir/scanner à l'échelle de LA
// variante précise, jamais seulement de son produit.
export interface SellableVariant {
  product: ApiProduct
  variant: ApiVariant
  // Étiquette lisible : "Nom du produit" seul si une unique variante sans déclinaison, sinon
  // "Nom du produit — Modèle/Taille" pour distinguer chaque déclinaison à l'écran.
  label: string
}

export function variantLabel(product: ApiProduct, variant: ApiVariant): string {
  // L'ordre des clés d'un objet JS suit l'ordre d'insertion pour des clés texte — comme le
  // formulaire écrit les attributs dans l'ordre configuré par la boutique (Boutique.
  // variant_attributes), le libellé respecte naturellement cet ordre sans logique supplémentaire.
  const descriptor = Object.values(variant.attributes).filter(Boolean).join(' / ')
  return descriptor ? `${product.name} — ${descriptor}` : product.name
}

export function flattenSellableVariants(products: ApiProduct[]): SellableVariant[] {
  return products.flatMap(product => product.variants.map(variant => ({ product, variant, label: variantLabel(product, variant) })))
}

// Recherche par nom de produit, modèle/taille, OU code-barres d'UNE variante précise — contrairement
// à ne filtrer que sur le code-barres de la variante primaire, ceci retrouve n'importe quelle
// déclinaison d'un produit à plusieurs variantes.
export function searchSellableVariants(products: ApiProduct[], term: string, limit = 6): SellableVariant[] {
  const needle = term.trim().toLowerCase()
  if (!needle) return []
  return flattenSellableVariants(products)
    .filter(({ product, variant }) => (
      product.name.toLowerCase().includes(needle)
      || variant.barcode.toLowerCase().includes(needle)
      || Object.values(variant.attributes).some(v => v.toLowerCase().includes(needle))
    ))
    .slice(0, limit)
}

// Retrouve la variante EXACTE dont le code-barres correspond à un scan — indispensable dès qu'un
// produit a plusieurs variantes, chacune avec son propre code-barres physique.
export function findVariantByBarcode(products: ApiProduct[], barcode: string): SellableVariant | undefined {
  return flattenSellableVariants(products).find(({ variant }) => variant.barcode === barcode)
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

// Une catégorie n'a que `name` d'obligatoire côté backend (voir catalog/models.py::Category) —
// `description`/`imageUrl` restent hors de ce formulaire minimal (créable à la volée depuis la
// page Produits, avant même d'avoir un seul produit).
export interface CategoryInput {
  name: string
}

export function useCreateCategory() {
  const queryClient = useQueryClient()
  const boutiqueId = useActiveBoutiqueId()
  return useMutation({
    mutationFn: (input: CategoryInput) =>
      api.post<ApiCategory>('/categories/', {
        boutique: boutiqueId ?? undefined, // undefined -> absent du JSON (le serveur le force pour un EMPLOYEE).
        name: input.name,
      }).then(res => res.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['categories'] }),
  })
}

export function useProducts() {
  const boutiqueId = useActiveBoutiqueId()
  return useQuery({
    queryKey: ['products', boutiqueId],
    queryFn: async () => (await fetchAllPages<RawProduct>('/products/', { boutique: boutiqueId ?? undefined })).map(mapProduct),
  })
}

// Une entrée de variante dans le formulaire — un produit "simple" (épicerie) n'en fournit qu'UNE
// seule, un produit à déclinaisons (mode) en fournit plusieurs (voir catalog/serializers.py::
// ProductWriteSerializer.update() pour la sémantique upsert : avec id = mise à jour, sans id =
// nouvelle variante, absente du tableau = supprimée).
export interface VariantInput {
  // Présent = met à jour CETTE variante existante ; absent = le serveur en crée une nouvelle.
  // TOUJOURS fournir l'id à la modification, sous peine que le serveur supprime l'ancienne
  // variante (et son stock !) pour en recréer une neuve à zéro.
  id?: number
  // Clés = attributs configurés par CETTE boutique (Boutique.variant_attributes) — le serveur
  // rejette toute clé inconnue (voir ProductWriteSerializer.validate côté backend).
  attributes?: Record<string, string>
  barcode: string
  sellingPrice: number
  costPrice: number
  lowStockThreshold: number
}

export interface ProductInput {
  category: number
  name: string
  unit: Unit
  expirationDate: string | null
  emoji: string
  variants: VariantInput[]
}

function toApiPayload(input: ProductInput, boutiqueId: number | null) {
  return {
    boutique: boutiqueId ?? undefined, // undefined -> absent du JSON (le serveur le force pour un EMPLOYEE).
    category: input.category,
    name: input.name,
    unit: input.unit,
    expiration_date: input.expirationDate,
    emoji: input.emoji,
    variants: input.variants.map(v => ({
      id: v.id,
      attributes: v.attributes ?? {},
      barcode: v.barcode,
      selling_price: v.sellingPrice,
      cost_price: v.costPrice,
      low_stock_threshold: v.lowStockThreshold,
    })),
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

// Upload de la photo d'UN produit déjà créé (voir ProductViewSet.upload_image côté backend) —
// séparé de useCreateProduct/useUpdateProduct : pas de fichier dans le JSON du formulaire
// principal, même principe que la photo de profil d'un compte (voir accounts/views.py).
export function useUploadProductImage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, file }: { id: number; file: File }) => {
      const formData = new FormData()
      formData.append('image', file)
      return mapProduct((await api.post<RawProduct>(`/products/${id}/upload-image/`, formData)).data)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['products'] }),
  })
}

// Retire la photo d'un produit -> l'affichage retombe sur son emoji (voir products/page.tsx).
export function useDeleteProductImage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => mapProduct((await api.post<RawProduct>(`/products/${id}/delete-image/`)).data),
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
