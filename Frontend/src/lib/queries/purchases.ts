'use client' // Hooks React (useQuery/useMutation) — ne s'exécutent que côté client.

// useMutation/useQuery/useQueryClient : briques TanStack Query pour lire/écrire l'API.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
// api : instance axios centralisée. fetchAllPages : déroule la pagination DRF.
import api, { fetchAllPages } from '@/lib/api'
// useActiveBoutiqueId : id de la boutique "en cours" pour la session (voir access.ts).
import { useActiveBoutiqueId } from '@/lib/access'

// Forme brute d'une ligne d'achat (Decimal -> chaînes).
interface RawPurchaseLine {
  id: number
  product: number
  variant: number | null
  quantity: string
  unit_cost: string
  line_cost: string
  note: string
  created_at: string
}

export interface ApiPurchaseLine {
  id: number
  product: number
  variant: number | null
  quantity: number
  unitCost: number
  lineCost: number
  note: string
}

function mapPurchaseLine(raw: RawPurchaseLine): ApiPurchaseLine {
  return {
    id: raw.id,
    product: raw.product,
    variant: raw.variant,
    quantity: Number(raw.quantity),
    unitCost: Number(raw.unit_cost),
    lineCost: Number(raw.line_cost),
    note: raw.note,
  }
}

// Forme brute d'un achat — lignes imbriquées en lecture.
interface RawPurchase {
  id: number
  boutique: number
  reference: string
  supplier: number | null
  sub_total: string
  purchase_cost: string
  total: string
  purchased_at: string | null
  status: string // Statut libre côté backend (pas un choix figé) — "RECU" après mark-received.
  notes: string
  created_at: string
  lines: RawPurchaseLine[]
}

export interface ApiPurchase {
  id: number
  reference: string
  supplier: number | null
  subTotal: number
  total: number
  purchasedAt: string | null
  status: string
  createdAt: string
  lines: ApiPurchaseLine[]
}

function mapPurchase(raw: RawPurchase): ApiPurchase {
  return {
    id: raw.id,
    reference: raw.reference,
    supplier: raw.supplier,
    subTotal: Number(raw.sub_total),
    total: Number(raw.total),
    purchasedAt: raw.purchased_at,
    status: raw.status,
    createdAt: raw.created_at,
    lines: raw.lines.map(mapPurchaseLine),
  }
}

// `boutique` en paramètre : voir le commentaire équivalent sur queries/products.ts::useProducts.
export function usePurchases() {
  const boutiqueId = useActiveBoutiqueId()
  return useQuery({
    queryKey: ['purchases', boutiqueId],
    queryFn: async () => (await fetchAllPages<RawPurchase>('/purchases/', { boutique: boutiqueId ?? undefined })).map(mapPurchase),
  })
}

export interface PurchaseLineInput {
  variant: number // Id de la VARIANTE achetée (jamais du produit directement).
  quantity: number
  unitCost: number
  note?: string
}

export interface PurchaseInput {
  supplier?: number | null
  purchasedAt?: string | null
  notes?: string
  lines: PurchaseLineInput[]
}

function toApiPayload(input: PurchaseInput, boutiqueId: number | null) {
  return {
    boutique: boutiqueId ?? undefined, // undefined -> absent du JSON (le serveur force la boutique de l'employé).
    supplier: input.supplier ?? null,
    purchased_at: input.purchasedAt ?? null,
    notes: input.notes ?? '',
    lines: input.lines.map(l => ({
      variant: l.variant,
      quantity: l.quantity,
      unit_cost: l.unitCost,
      note: l.note ?? '',
    })),
  }
}

// `sub_total`/`purchase_cost`/`total` sont TOUJOURS recalculés côté serveur à partir des
// lignes — jamais envoyés par le client (voir PurchaseWriteSerializer._apply_computed_totals).
export function useCreatePurchase() {
  const queryClient = useQueryClient()
  const boutiqueId = useActiveBoutiqueId()
  return useMutation({
    mutationFn: async (input: PurchaseInput) =>
      mapPurchase((await api.post<RawPurchase>('/purchases/', toApiPayload(input, boutiqueId))).data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['purchases'] }),
  })
}

// Marque un achat comme reçu — pose un mouvement ENTREE par ligne côté serveur, augmentant le
// stock de chaque variante concernée. Aucun payload : l'action agit sur les lignes déjà enregistrées.
export function useMarkPurchaseReceived() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => mapPurchase((await api.post<RawPurchase>(`/purchases/${id}/mark-received/`)).data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] })
      // Le stock de chaque variante reçue vient d'augmenter.
      queryClient.invalidateQueries({ queryKey: ['products'] })
    },
  })
}
