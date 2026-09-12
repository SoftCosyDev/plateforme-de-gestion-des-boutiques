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

// Encaisse un paiement — passe par l'action dédiée `record-payment` (voir
// accounts/customers/views.py::CustomerViewSet.record_payment), qui baisse le solde ET pose une
// ligne CustomerPayment dans le même mouvement côté serveur : on envoie le MONTANT reçu, jamais
// le nouveau solde calculé côté client (le serveur seul connaît le solde à jour et refuse un
// montant qui dépasserait l'ardoise actuelle).
export function useRecordPayment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, amount }: { id: number; amount: number }) =>
      api.post<RawCustomer>(`/customers/${id}/record-payment/`, { amount }).then(res => mapCustomer(res.data)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      queryClient.invalidateQueries({ queryKey: ['customer-payments'] })
    },
  })
}

// Forme brute d'une ligne d'historique de paiement (voir CustomerPaymentSerializer).
interface RawCustomerPayment {
  id: number
  boutique: number
  customer: number
  amount: string
  balance_after: string
  user: number | null
  user_name: string
  created_at: string
}

export interface ApiCustomerPayment {
  id: number
  amount: number
  balanceAfter: number
  userName: string
  createdAt: string
}

function mapCustomerPayment(raw: RawCustomerPayment): ApiCustomerPayment {
  return {
    id: raw.id,
    amount: Number(raw.amount),
    balanceAfter: Number(raw.balance_after),
    // Compte supprimé depuis (SET_NULL) -> user_name vide côté serveur, affiché comme "inconnu"
    // plutôt que de laisser un blanc silencieux dans l'historique.
    userName: raw.user_name || 'Compte supprimé',
    createdAt: raw.created_at,
  }
}

// Historique des règlements d'UN client précis — traçabilité (qui a encaissé quoi, quand),
// affichée dans la fiche client (voir customers/page.tsx). `enabled: !!customerId` : ne
// déclenche aucun appel tant qu'aucun client n'est réellement ciblé (ex: modale fermée).
export function useCustomerPayments(customerId: number | null) {
  return useQuery({
    queryKey: ['customer-payments', customerId],
    queryFn: async () =>
      (await fetchAllPages<RawCustomerPayment>('/customer-payments/', { customer: customerId ?? undefined })).map(mapCustomerPayment),
    enabled: !!customerId,
  })
}
