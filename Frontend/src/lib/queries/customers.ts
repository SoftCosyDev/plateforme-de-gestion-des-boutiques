'use client' // Hooks React (useQuery/useMutation) — ne s'exécutent que côté client.

// useMutation/useQuery/useQueryClient : briques TanStack Query pour lire/écrire l'API.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
// api : instance axios centralisée. fetchAllPages : déroule la pagination DRF.
import api, { fetchAllPages } from '@/lib/api'
// useActiveBoutiqueId : id de la boutique "en cours" pour la session (voir access.ts).
import { useActiveBoutiqueId } from '@/lib/access'

// Forme brute renvoyée par l'API (Decimal -> chaîne pour balance_due).
interface RawCustomer {
  id: number
  boutique: number
  name: string
  phone: string
  address: string
  balance_due: string
  created_at: string
}

// Forme convertie (nombre réel), utilisée partout dans l'UI.
export interface ApiCustomer {
  id: number
  boutique: number
  name: string
  phone: string
  address: string
  balanceDue: number
  createdAt: string
}

function mapCustomer(raw: RawCustomer): ApiCustomer {
  return {
    id: raw.id,
    boutique: raw.boutique,
    name: raw.name,
    phone: raw.phone,
    address: raw.address,
    balanceDue: Number(raw.balance_due),
    createdAt: raw.created_at,
  }
}

// `boutique` en paramètre : voir le commentaire équivalent sur queries/products.ts::useProducts.
export function useCustomers() {
  const boutiqueId = useActiveBoutiqueId()
  return useQuery({
    queryKey: ['customers', boutiqueId],
    queryFn: async () => (await fetchAllPages<RawCustomer>('/customers/', { boutique: boutiqueId ?? undefined })).map(mapCustomer),
  })
}

// Champs collectés par le formulaire de création — `address`/`balanceDue` restent optionnels
// (un nouveau client démarre sans ardoise, sauf cas particulier).
export interface CustomerInput {
  name: string
  phone: string
  address?: string
  balanceDue?: number
}

function toApiPayload(input: CustomerInput, boutiqueId: number | null) {
  return {
    boutique: boutiqueId ?? undefined, // undefined -> absent du JSON (le serveur le force pour un EMPLOYEE).
    name: input.name,
    phone: input.phone,
    address: input.address ?? '',
    balance_due: input.balanceDue ?? 0,
  }
}

export function useCreateCustomer() {
  const queryClient = useQueryClient()
  const boutiqueId = useActiveBoutiqueId()
  return useMutation({
    mutationFn: async (input: CustomerInput) =>
      mapCustomer((await api.post<RawCustomer>('/customers/', toApiPayload(input, boutiqueId))).data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['customers'] }),
  })
}

// Encaisse un paiement — `balance_due` est un champ simple et directement modifiable côté
// backend (pas de mécanisme de ledger dédié pour l'ardoise) : on envoie le NOUVEAU solde,
// calculé ici (solde actuel - montant reçu), jamais un delta.
export function useRecordPayment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, newBalance }: { id: number; newBalance: number }) =>
      api.patch<RawCustomer>(`/customers/${id}/`, { balance_due: newBalance }).then(res => mapCustomer(res.data)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['customers'] }),
  })
}
