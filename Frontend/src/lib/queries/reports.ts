'use client' // Hooks React (useQuery) — ne s'exécutent que côté client.

// useQuery : brique TanStack Query pour lire l'API.
import { useQuery } from '@tanstack/react-query'
// api : instance axios centralisée.
import api from '@/lib/api'

// Les 5 endpoints ci-dessous sont de purs calculs d'agrégation côté serveur — aucune conversion
// de forme n'est nécessaire côté client au-delà du typage, mais les champs Decimal (DRF les sérialise
// en chaînes même dans une réponse "brute") sont normalisés en nombres pour rester utilisables tels quels.

export interface DashboardSummary {
  totalProducts: number
  totalStockValue: number
  activeAlerts: number
  totalSalesAmount: number
  todayRefunds: number
}

export function useDashboardSummary() {
  return useQuery({
    queryKey: ['reports', 'summary'],
    queryFn: async () => {
      const { data } = await api.get('/reports/summary/')
      return {
        totalProducts: data.total_products,
        totalStockValue: Number(data.total_stock_value),
        activeAlerts: data.active_alerts,
        totalSalesAmount: Number(data.total_sales_amount),
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
  return useQuery({
    queryKey: ['reports', 'charts'],
    queryFn: async () => {
      const { data } = await api.get<{ month: string; ventes: string; entrees: string }[]>('/reports/charts/')
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
  return useQuery({
    queryKey: ['reports', 'categories'],
    queryFn: () => api.get<DashboardCategorySlice[]>('/reports/categories/').then(res => res.data),
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
  return useQuery({
    queryKey: ['reports', 'product-performance'],
    queryFn: async () => {
      const { data } = await api.get('/reports/product-performance/')
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
  return useQuery({
    queryKey: ['reports', 'recent-data'],
    queryFn: async () => {
      const { data } = await api.get('/reports/recent-data/')
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
