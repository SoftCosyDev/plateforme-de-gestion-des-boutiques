'use client' // Hooks React (useQuery/useMutation) — ne s'exécutent que côté client.

// useMutation/useQuery/useQueryClient : briques TanStack Query pour lire/écrire l'API.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
// api : instance axios centralisée. fetchAllPages : déroule la pagination DRF.
import api, { fetchAllPages } from '@/lib/api'
// useActiveBoutiqueId : id de la boutique "en cours" pour la session (voir access.ts).
import { useActiveBoutiqueId } from '@/lib/access'

export type Channel = 'store' | 'en_ligne'
export type PaymentMode = 'cash' | 'mobile_money' | 'credit'
export type SaleStatus = 'PAYE' | 'NONPAYE' | 'PARTIEL' | 'REMBOURSE'

// Forme brute d'une ligne de vente (Decimal -> chaînes).
interface RawSaleLine {
  id: number
  product: number
  variant: number | null
  quantity: string
  unit_price: string
  line_discount: string
  line_total: string
}

export interface ApiSaleLine {
  id: number
  product: number
  variant: number | null
  quantity: number
  unitPrice: number
  lineDiscount: number
  lineTotal: number
}

function mapSaleLine(raw: RawSaleLine): ApiSaleLine {
  return {
    id: raw.id,
    product: raw.product,
    variant: raw.variant,
    quantity: Number(raw.quantity),
    unitPrice: Number(raw.unit_price),
    lineDiscount: Number(raw.line_discount),
    lineTotal: Number(raw.line_total),
  }
}

// Forme brute d'une vente — telle que reçue depuis l'API (lignes imbriquées en lecture).
interface RawSale {
  id: number
  boutique: number
  invoice_number: number | null
  employee: number | null
  customer: number | null
  customer_name: string
  sold_at: string | null
  channel: Channel
  payment_mode: PaymentMode
  mobile_money_reference: string
  mobile_money_sender: string
  subtotal: string
  discount_amount: string
  total: string
  status: SaleStatus
  notes: string
  created_at: string
  lines: RawSaleLine[]
}

export interface ApiSale {
  id: number
  invoiceNumber: number | null
  employee: number | null // Vendeur — id d'un EmployeeProfile, jamais envoyé par le client (déduit côté serveur).
  customer: number | null
  customerName: string
  soldAt: string | null // Horodatage réel de l'encaissement — à préférer à createdAt pour trier/filtrer par période.
  channel: Channel
  paymentMode: PaymentMode
  mobileMoneyReference: string
  mobileMoneySender: string
  status: SaleStatus
  subtotal: number
  discountAmount: number
  total: number
  notes: string
  createdAt: string
  lines: ApiSaleLine[]
}

function mapSale(raw: RawSale): ApiSale {
  return {
    id: raw.id,
    invoiceNumber: raw.invoice_number,
    employee: raw.employee,
    customer: raw.customer,
    customerName: raw.customer_name,
    soldAt: raw.sold_at,
    channel: raw.channel,
    paymentMode: raw.payment_mode,
    mobileMoneyReference: raw.mobile_money_reference,
    mobileMoneySender: raw.mobile_money_sender,
    status: raw.status,
    subtotal: Number(raw.subtotal),
    discountAmount: Number(raw.discount_amount),
    total: Number(raw.total),
    notes: raw.notes,
    createdAt: raw.created_at,
    lines: raw.lines.map(mapSaleLine),
  }
}

// Ventes immuables après création (pas de PUT/PATCH/DELETE côté API) — lecture seule ici.
// `boutique` en paramètre : voir le commentaire équivalent sur queries/products.ts::useProducts.
export function useSales() {
  const boutiqueId = useActiveBoutiqueId()
  return useQuery({
    queryKey: ['sales', boutiqueId],
    queryFn: async () => (await fetchAllPages<RawSale>('/sales/', { boutique: boutiqueId ?? undefined })).map(mapSale),
  })
}

export interface SaleLineInput {
  variant: number // Id de la VARIANTE vendue (jamais du produit directement).
  quantity: number
  unitPrice?: number // Optionnel — retombe sur le prix catalogue de la variante si absent.
  lineDiscount?: number
}

export interface SaleInput {
  customer?: number | null
  channel?: Channel // Défaut : vente comptoir ('store').
  paymentMode: PaymentMode
  mobileMoneyReference?: string
  mobileMoneySender?: string
  lines: SaleLineInput[]
}

function toApiPayload(input: SaleInput, boutiqueId: number | null) {
  return {
    boutique: boutiqueId ?? undefined, // undefined -> absent du JSON (le serveur force la boutique de l'employé).
    customer: input.customer ?? null,
    channel: input.channel ?? 'store',
    payment_mode: input.paymentMode,
    mobile_money_reference: input.mobileMoneyReference ?? '',
    mobile_money_sender: input.mobileMoneySender ?? '',
    lines: input.lines.map(l => ({
      variant: l.variant,
      quantity: l.quantity,
      unit_price: l.unitPrice,
      line_discount: l.lineDiscount ?? 0,
    })),
  }
}

// Encaisse une vente — `employee` n'est JAMAIS envoyé (le serveur le déduit de
// `request.user.employee_profile`, seul un compte EMPLOYEE peut appeler cet endpoint).
export function useCreateSale() {
  const queryClient = useQueryClient()
  const boutiqueId = useActiveBoutiqueId()
  return useMutation({
    mutationFn: async (input: SaleInput) =>
      mapSale((await api.post<RawSale>('/sales/', toApiPayload(input, boutiqueId))).data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales'] })
      // Le stock de chaque variante vendue vient de baisser (mouvement SORTIE côté serveur).
      queryClient.invalidateQueries({ queryKey: ['products'] })
      // L'ardoise du client a pu augmenter (vente à crédit).
      queryClient.invalidateQueries({ queryKey: ['customers'] })
    },
  })
}
