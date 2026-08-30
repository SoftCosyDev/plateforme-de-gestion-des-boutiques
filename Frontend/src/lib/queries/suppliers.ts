'use client' // Hooks React (useQuery/useMutation) — ne s'exécutent que côté client.

// useMutation/useQuery/useQueryClient : briques TanStack Query pour lire/écrire l'API.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
// api : instance axios centralisée. fetchAllPages : déroule la pagination DRF.
import api, { fetchAllPages } from '@/lib/api'
// useActiveBoutiqueId : id de la boutique "en cours" pour la session (voir access.ts).
import { useActiveBoutiqueId } from '@/lib/access'

// Un fournisseur — CRUD simple, aucune conversion de type nécessaire (pas de Decimal ici).
export interface ApiSupplier {
  id: number
  boutique: number
  name: string
  phone: string
  address: string
  created_at: string
}

// `boutique` en paramètre : voir le commentaire équivalent sur queries/products.ts::useProducts.
export function useSuppliers() {
  const boutiqueId = useActiveBoutiqueId()
  return useQuery({
    queryKey: ['suppliers', boutiqueId],
    queryFn: () => fetchAllPages<ApiSupplier>('/suppliers/', { boutique: boutiqueId ?? undefined }),
  })
}

export interface SupplierInput {
  name: string
  phone?: string
  address?: string
}

function toApiPayload(input: SupplierInput, boutiqueId: number | null) {
  return {
    boutique: boutiqueId ?? undefined, // undefined -> absent du JSON (le serveur le force pour un EMPLOYEE).
    name: input.name,
    phone: input.phone ?? '',
    address: input.address ?? '',
  }
}

export function useCreateSupplier() {
  const queryClient = useQueryClient()
  const boutiqueId = useActiveBoutiqueId()
  return useMutation({
    mutationFn: (input: SupplierInput) => api.post<ApiSupplier>('/suppliers/', toApiPayload(input, boutiqueId)).then(res => res.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['suppliers'] }),
  })
}

export function useUpdateSupplier() {
  const queryClient = useQueryClient()
  const boutiqueId = useActiveBoutiqueId()
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: SupplierInput }) =>
      api.patch<ApiSupplier>(`/suppliers/${id}/`, toApiPayload(input, boutiqueId)).then(res => res.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['suppliers'] }),
  })
}

export function useDeleteSupplier() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.delete(`/suppliers/${id}/`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['suppliers'] }),
  })
}
