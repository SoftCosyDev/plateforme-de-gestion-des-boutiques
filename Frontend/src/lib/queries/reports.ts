'use client' // Hooks React (useQuery) — ne s'exécutent que côté client.

// useQuery : brique TanStack Query pour lire l'API.
import { useQuery } from '@tanstack/react-query'
// api : instance axios centralisée.
import api from '@/lib/api'
// useActiveBoutiqueId : id de la boutique "en cours" pour la session (voir access.ts).
import { useActiveBoutiqueId } from '@/lib/access'

// Les 5 endpoints ci-dessous sont de purs calculs d'agrégation côté serveur — aucune conversion
// de forme n'est nécessaire côté client au-delà du typage, mais les champs Decimal (DRF les sérialise
// en chaînes même dans une réponse "brute") sont normalisés en nombres pour rester utilisables tels quels.

export interface DashboardSummary {
  totalProducts: number
  totalStockValue: number
  activeAlerts: number
  totalSalesAmount: number
  // Bénéfice — DIFFÉRENT du CA total : revenu moins coût d'achat des articles vendus (voir
  // Backend/reports/views.py::DashboardSummaryView pour le détail du calcul et ses limites).
  totalProfit: number
  todaySalesAmount: number
  todaySalesCount: number
  todayRefunds: number
}

// `boutique` en paramètre : sans lui, un SUPERADMIN/OWNER multi-boutiques verrait ses 5 agrégats
// mélanger TOUTES ses boutiques au lieu de celle actuellement affichée à l'écran (même correctif
// que sur les listes métier, voir queries/products.ts::useProducts). La clé de requête inclut
// boutiqueId pour que changer de boutique déclenche un vrai refetch.
export function useDashboardSummary() {
  const boutiqueId = useActiveBoutiqueId()
  return useQuery({
    queryKey: ['reports', 'summary', boutiqueId],
    queryFn: async () => {
      const { data } = await api.get('/reports/summary/', { params: { boutique: boutiqueId ?? undefined } })
      return {
        totalProducts: data.total_products,
        totalStockValue: Number(data.total_stock_value),
        activeAlerts: data.active_alerts,
        totalSalesAmount: Number(data.total_sales_amount),
        totalProfit: Number(data.total_profit),
        todaySalesAmount: Number(data.today_sales_amount),
        todaySalesCount: data.today_sales_count,
        todayRefunds: data.today_refunds,
      } as DashboardSummary
    },
  })
}

export interface DashboardChartPoint {
  month: string // Format "YYYY-MM".
  ventes: number
  entrees: number
}

export function useDashboardCharts() {
  const boutiqueId = useActiveBoutiqueId()
  return useQuery({
    queryKey: ['reports', 'charts', boutiqueId],
    queryFn: async () => {
      const { data } = await api.get<{ month: string; ventes: string; entrees: string }[]>('/reports/charts/', { params: { boutique: boutiqueId ?? undefined } })
      return data.map(p => ({ month: p.month, ventes: Number(p.ventes), entrees: Number(p.entrees) }))
    },
  })
}

export interface DashboardCategorySlice {
  name: string
  value: number
  color: string
}

export function useDashboardCategories() {
  const boutiqueId = useActiveBoutiqueId()
  return useQuery({
    queryKey: ['reports', 'categories', boutiqueId],
    queryFn: () => api.get<DashboardCategorySlice[]>('/reports/categories/', { params: { boutique: boutiqueId ?? undefined } }).then(res => res.data),
  })
}

export interface ProductRotation {
  id: number
  name: string
  sold: number
  stock: number
  rotation: number
}

export interface DashboardProductPerformance {
  highRotation: ProductRotation[]
  lowRotation: ProductRotation[]
}

export function useDashboardProductPerformance() {
  const boutiqueId = useActiveBoutiqueId()
  return useQuery({
    queryKey: ['reports', 'product-performance', boutiqueId],
    queryFn: async () => {
      const { data } = await api.get('/reports/product-performance/', { params: { boutique: boutiqueId ?? undefined } })
      const mapRotation = (r: any): ProductRotation => ({
        id: r.id, name: r.name, sold: Number(r.sold), stock: Number(r.stock), rotation: Number(r.rotation),
      })
      return {
        highRotation: data.high_rotation.map(mapRotation),
        lowRotation: data.low_rotation.map(mapRotation),
      } as DashboardProductPerformance
    },
  })
}

export interface LowStockAlert {
  product: string
  availableQty: number
  severity: 'critical' | 'warning'
  message: string
}

export interface RecentMovement {
  productName: string
  type: 'ENTREE' | 'SORTIE' | 'AJUSTEMENT'
  qty: number
  date: string
}

export interface DashboardRecentData {
  lowStock: LowStockAlert[]
  movements: RecentMovement[]
}

export function useDashboardRecentData() {
  const boutiqueId = useActiveBoutiqueId()
  return useQuery({
    queryKey: ['reports', 'recent-data', boutiqueId],
    queryFn: async () => {
      const { data } = await api.get('/reports/recent-data/', { params: { boutique: boutiqueId ?? undefined } })
      return {
        lowStock: data.low_stock.map((l: any) => ({
          product: l.product, availableQty: Number(l.available_qty), severity: l.severity, message: l.message,
        })),
        movements: data.movements.map((m: any) => ({
          productName: m.product_name, type: m.type, qty: Number(m.qty), date: m.date,
        })),
      } as DashboardRecentData
    },
  })
}
