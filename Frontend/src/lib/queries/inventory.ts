'use client' // Hooks React (useQuery/useMutation) — ne s'exécutent que côté client.

// useMutation/useQuery/useQueryClient : briques TanStack Query pour lire/écrire l'API.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
// api : instance axios centralisée. fetchAllPages : déroule la pagination DRF.
import api, { fetchAllPages } from '@/lib/api'
// useActiveBoutiqueId : id de la boutique "en cours" pour la session (voir access.ts).
import { useActiveBoutiqueId } from '@/lib/access'

export type InventoryStatus = 'en_cours' | 'termine'

// Forme brute d'une ligne d'inventaire (Decimal -> chaînes, nullable tant que non comptée).
interface RawInventoryLine {
  id: number
  inventory_count: number
  product: number
  variant: number | null
  expected_qty: string | null
  counted_qty: string | null
  discrepancy: string | null
}

export interface ApiInventoryLine {
  id: number
  product: number
  variant: number | null
  expectedQty: number
  countedQty: number | null
  discrepancy: number | null
}

function mapInventoryLine(raw: RawInventoryLine): ApiInventoryLine {
  return {
    id: raw.id,
    product: raw.product,
    variant: raw.variant,
    expectedQty: raw.expected_qty != null ? Number(raw.expected_qty) : 0,
    countedQty: raw.counted_qty != null ? Number(raw.counted_qty) : null,
    discrepancy: raw.discrepancy != null ? Number(raw.discrepancy) : null,
  }
}

// Forme brute d'une session d'inventaire — lignes imbriquées en lecture. Noms `total_variantes`/
// `quantite_comptee`/`ecart` repris tels quels de SoftCosy (voir Backend/inventory/models.py).
interface RawInventoryCount {
  id: number
  boutique: number
  status: InventoryStatus
  notes: string
  created_at: string
  user: number | null
  total_variantes: number
  quantite_comptee: string | null
  ecart: string | null
  lines: RawInventoryLine[]
}

export interface ApiInventoryCount {
  id: number
  status: InventoryStatus
  notes: string
  createdAt: string
  totalVariantes: number
  quantiteComptee: number | null
  ecart: number | null
  lines: ApiInventoryLine[]
}

function mapInventoryCount(raw: RawInventoryCount): ApiInventoryCount {
  return {
    id: raw.id,
    status: raw.status,
    notes: raw.notes,
    createdAt: raw.created_at,
    totalVariantes: raw.total_variantes,
    quantiteComptee: raw.quantite_comptee != null ? Number(raw.quantite_comptee) : null,
    ecart: raw.ecart != null ? Number(raw.ecart) : null,
    lines: raw.lines.map(mapInventoryLine),
  }
}

// `boutique` en paramètre : voir le commentaire équivalent sur queries/products.ts::useProducts.
export function useInventoryCounts() {
  const boutiqueId = useActiveBoutiqueId()
  return useQuery({
    queryKey: ['inventory', boutiqueId],
    queryFn: async () => (await fetchAllPages<RawInventoryCount>('/inventory-counts/', { boutique: boutiqueId ?? undefined })).map(mapInventoryCount),
  })
}

// Lancer un comptage = choisir les variantes à compter — `expected_qty` de chaque ligne est
// figé côté serveur depuis le stock réel à cet instant précis (voir InventoryCountWriteSerializer).
export interface InventoryCountInput {
  notes?: string
  variantIds: number[]
}

export function useCreateInventoryCount() {
  const queryClient = useQueryClient()
  const boutiqueId = useActiveBoutiqueId()
  return useMutation({
    mutationFn: async (input: InventoryCountInput) =>
      mapInventoryCount((await api.post<RawInventoryCount>('/inventory-counts/', {
        boutique: boutiqueId ?? undefined, // undefined -> absent du JSON (le serveur le force pour un EMPLOYEE).
        notes: input.notes ?? '',
        lines: input.variantIds.map(variant => ({ variant })),
      })).data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['inventory'] }),
  })
}

// Saisit le comptage physique d'UNE ligne — le serveur recalcule aussitôt `discrepancy`
// (counted_qty - expected_qty), jamais calculé ici.
export function useUpdateInventoryLine() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, countedQty }: { id: number; countedQty: number }) =>
      api.patch(`/inventory-lines/${id}/`, { counted_qty: countedQty }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['inventory'] }),
  })
}

// Clôture le comptage — pose un mouvement AJUSTEMENT par ligne dont l'écart est non nul, puis
// verrouille la session (aucune modification possible après coup, voir InventoryCountViewSet.finish).
export function useFinishInventoryCount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => mapInventoryCount((await api.post<RawInventoryCount>(`/inventory-counts/${id}/finish/`)).data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      // Le stock de chaque variante en écart vient d'être ajusté.
      queryClient.invalidateQueries({ queryKey: ['products'] })
    },
  })
}
