'use client' // Hooks React (useQuery/useMutation) — ne s'exécutent que côté client.

// useMutation/useQuery/useQueryClient : briques TanStack Query pour lire/écrire l'API.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
// api : instance axios centralisée. fetchAllPages : déroule la pagination DRF.
import api, { fetchAllPages } from '@/lib/api'
// useActiveBoutiqueId : id de la boutique "en cours" pour la session (voir access.ts).
import { useActiveBoutiqueId } from '@/lib/access'

export type OrderChannel = 'SITE_WEB' | 'APPLICATION'
export type OrderPaymentMode = 'CASH_LIVRAISON' | 'MOBILE_MONEY'
export type OrderStatus = 'EN_ATTENTE' | 'EN_COURS' | 'LIVRE' | 'ANNULE'

// Forme brute d'une ligne de commande (Decimal -> chaînes).
interface RawOrderLine {
  id: number
  product: number
  variant: number | null
  variant_label: string
  quantity: string
  unit_price: string
  line_total: string
}

export interface ApiOrderLine {
  id: number
  product: number
  variant: number | null
  variantLabel: string
  quantity: number
  unitPrice: number
  lineTotal: number
}

function mapOrderLine(raw: RawOrderLine): ApiOrderLine {
  return {
    id: raw.id,
    product: raw.product,
    variant: raw.variant,
    variantLabel: raw.variant_label,
    quantity: Number(raw.quantity),
    unitPrice: Number(raw.unit_price),
    lineTotal: Number(raw.line_total),
  }
}

// Forme brute d'une commande — lignes imbriquées en lecture.
interface RawOrder {
  id: number
  boutique: number
  customer: number | null
  customer_name: string
  customer_phone: string
  delivery_address: string
  channel: OrderChannel
  payment_mode: OrderPaymentMode
  status: OrderStatus
  subtotal: string
  total: string
  notes: string
  user: number | null
  created_at: string
  updated_at: string
  lines: RawOrderLine[]
}

export interface ApiOrder {
  id: number
  customer: number | null
  customerName: string
  customerPhone: string
  deliveryAddress: string
  channel: OrderChannel
  paymentMode: OrderPaymentMode
  status: OrderStatus
  subtotal: number
  total: number
  createdAt: string
  lines: ApiOrderLine[]
}

function mapOrder(raw: RawOrder): ApiOrder {
  return {
    id: raw.id,
    customer: raw.customer,
    customerName: raw.customer_name,
    customerPhone: raw.customer_phone,
    deliveryAddress: raw.delivery_address,
    channel: raw.channel,
    paymentMode: raw.payment_mode,
    status: raw.status,
    subtotal: Number(raw.subtotal),
    total: Number(raw.total),
    createdAt: raw.created_at,
    lines: raw.lines.map(mapOrderLine),
  }
}

// `boutique` en paramètre : voir le commentaire équivalent sur queries/products.ts::useProducts.
export function useOrders() {
  const boutiqueId = useActiveBoutiqueId()
  return useQuery({
    queryKey: ['orders', boutiqueId],
    queryFn: async () => (await fetchAllPages<RawOrder>('/orders/', { boutique: boutiqueId ?? undefined })).map(mapOrder),
  })
}

export interface OrderLineInput {
  product: number
  variant?: number | null // Toujours connu ici (catalogue interne) — resterait vide pour une future vitrine publique.
  quantity: number
  unitPrice: number // Obligatoire côté backend (pas de repli automatique comme pour une vente).
}

export interface OrderInput {
  customer?: number | null
  customerName: string
  customerPhone: string
  deliveryAddress?: string
  paymentMode: OrderPaymentMode
  notes?: string
  lines: OrderLineInput[]
}

function toApiPayload(input: OrderInput, boutiqueId: number | null) {
  return {
    boutique: boutiqueId ?? undefined, // undefined -> absent du JSON (le serveur le force pour un EMPLOYEE).
    customer: input.customer ?? null,
    customer_name: input.customerName,
    customer_phone: input.customerPhone,
    delivery_address: input.deliveryAddress ?? '',
    payment_mode: input.paymentMode,
    notes: input.notes ?? '',
    lines: input.lines.map(l => ({
      product: l.product,
      variant: l.variant ?? null,
      quantity: l.quantity,
      unit_price: l.unitPrice,
    })),
  }
}

// `user` n'est jamais envoyé (toujours le compte connecté côté serveur) ; `channel` retombe sur
// APPLICATION (saisie depuis l'appli de gestion, jamais depuis un site web pas encore construit).
export function useCreateOrder() {
  const queryClient = useQueryClient()
  const boutiqueId = useActiveBoutiqueId()
  return useMutation({
    mutationFn: async (input: OrderInput) =>
      mapOrder((await api.post<RawOrder>('/orders/', toApiPayload(input, boutiqueId))).data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['orders'] }),
  })
}

// Vérifie le stock disponible ligne par ligne côté serveur AVANT de livrer — peut donc échouer
// (rejet 400 avec le détail des lignes en rupture), voir orders/views.py::mark_delivered.
export function useMarkOrderDelivered() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => mapOrder((await api.post<RawOrder>(`/orders/${id}/mark-delivered/`)).data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      // Le stock de chaque variante livrée vient de baisser.
      queryClient.invalidateQueries({ queryKey: ['products'] })
    },
  })
}

export function useMarkOrderCancelled() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => mapOrder((await api.post<RawOrder>(`/orders/${id}/mark-cancelled/`)).data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['orders'] }),
  })
}
