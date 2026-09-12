'use client' // Page interactive (aucune donnée statique) — jamais rendue côté serveur.

import { useMemo } from 'react' // Mémorisation des dérivés locaux.
import { BarChart3, ShoppingBag, TrendingUp, TrendingDown, UserCog } from 'lucide-react' // Icônes.
import { Card } from '@/components/ui/card' // Conteneur visuel réutilisable.
import { Badge } from '@/components/ui/badge' // Petite étiquette stylée.
import { useEmployees } from '@/lib/queries/employees' // Employés réels (Phase 7).
import { useAttendanceRecords } from '@/lib/queries/attendance' // Présences réelles (Phase 7).
import { currentPayrollPeriod, usePayrollEntries } from '@/lib/queries/payroll' // Paie réelle (Phase 7).
import {
  useDashboardCategories, useDashboardCharts, useDashboardProductPerformance,
} from '@/lib/queries/reports' // Agrégats calculés côté serveur — jamais recalculés ici.

// Petite barre de progression réutilisée pour chaque section — purement visuelle.
function Bar({ pct, className = '' }: { pct: number; className?: string }) {
  return (
    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
      <div className={`h-full rounded-full ${className || 'bg-primary'}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
    </div>
  )
}

export default function ReportsPage() {
  const { data: charts = [], isLoading: chartsLoading } = useDashboardCharts()
  const { data: categories = [], isLoading: categoriesLoading } = useDashboardCategories()
  const { data: performance, isLoading: performanceLoading } = useDashboardProductPerformance()
  const { data: employees = [] } = useEmployees()
  const { data: attendance = [] } = useAttendanceRecords()
  const { data: payroll = [] } = usePayrollEntries()

  const maxChartValue = useMemo(
    () => Math.max(1, ...charts.flatMap(c => [c.ventes, c.entrees])),
    [charts],
  )
  const maxCategoryValue = useMemo(() => Math.max(1, ...categories.map(c => c.value)), [categories])

  // Masse salariale de la période en cours — données réelles (Phase 7), filtrées ici,
  // jamais un recalcul du montant lui-même (net_pay reste entièrement calculé côté serveur).
  const payrollPeriod = currentPayrollPeriod()
  const currentPayroll = payroll.filter(p => p.periodLabel === payrollPeriod.label)
  const payrollTotal = currentPayroll.reduce((sum, p) => sum + p.netPay, 0)
  const payrollPaid = currentPayroll.reduce((sum, p) => sum + p.amountPaid, 0)
  const activeEmployeeCount = employees.filter(e => e.status === 'actif').length
  const monthKey = new Date().toISOString().slice(0, 7)
  const monthAttendance = attendance.filter(a => a.date.slice(0, 7) === monthKey)
  const absencesCount = monthAttendance.filter(a => a.type === 'absence').length
  const lateCount = monthAttendance.filter(a => a.type === 'retard').length

  if (chartsLoading || categoriesLoading || performanceLoading || !performance) {
    return <div className="p-12 text-center text-muted-foreground">Chargement des rapports...</div>
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground flex items-center gap-3">
          <BarChart3 className="w-8 h-8 text-primary" />
          Rapports & Statistiques
        </h1>
        <p className="text-muted-foreground mt-1 text-sm font-medium">Tendances sur 6 mois, catégories, rotation des produits et paie</p>
      </div>

      {/* Évolution sur 6 mois */}
      <Card className="p-6 border border-border/50 shadow-sm bg-card">
        <h3 className="font-bold text-foreground flex items-center gap-2 mb-4">
          <ShoppingBag className="w-4 h-4 text-primary" /> Évolution sur 6 mois
        </h3>
        <div className="space-y-4">
          {charts.map(point => (
            <div key={point.month} className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold">{point.month}</span>
                <span className="text-muted-foreground">
                  <span className="font-bold text-foreground">{point.ventes.toLocaleString()}</span> vendu(s) ·{' '}
                  <span className="font-bold text-foreground">{point.entrees.toLocaleString()}</span> entrée(s)
                </span>
              </div>
              <Bar pct={(point.ventes / maxChartValue) * 100} />
              <Bar pct={(point.entrees / maxChartValue) * 100} className="bg-accent" />
            </div>
          ))}
          {charts.length === 0 && <p className="text-sm text-muted-foreground">Aucune donnée sur les 6 derniers mois.</p>}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Ventes par catégorie */}
        <Card className="p-6 border border-border/50 shadow-sm bg-card">
          <h3 className="font-bold text-foreground mb-4">Produits par catégorie</h3>
          <div className="space-y-3">
            {categories.map(c => (
              <div key={c.name} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold">{c.name}</span>
                  <span className="font-bold">{c.value}</span>
                </div>
                <Bar pct={(c.value / maxCategoryValue) * 100} />
              </div>
            ))}
            {categories.length === 0 && <p className="text-sm text-muted-foreground">Aucune catégorie.</p>}
          </div>
        </Card>

        {/* Masse salariale */}
        <Card className="p-6 border border-border/50 shadow-sm bg-card">
          <h3 className="font-bold text-foreground flex items-center gap-2 mb-4">
            <UserCog className="w-4 h-4 text-primary" /> Paie — {payrollPeriod.label}
          </h3>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="p-3 rounded-xl bg-primary/5 border border-primary/20">
              <p className="text-[12px] text-muted-foreground uppercase font-bold">Masse salariale</p>
              <p className="text-lg font-black">{payrollTotal.toLocaleString()} FCFA</p>
            </div>
            <div className="p-3 rounded-xl bg-green-500/5 border border-green-500/20">
              <p className="text-[12px] text-muted-foreground uppercase font-bold">Déjà payé</p>
              <p className="text-lg font-black text-green-600">{payrollPaid.toLocaleString()} FCFA</p>
            </div>
          </div>
          <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
            <span>{activeEmployeeCount} employé(s) actif(s)</span>
            <Badge variant="outline" className="text-[12px]">{absencesCount} absence(s) · {lateCount} retard(s) ce mois</Badge>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Meilleures rotations */}
        <Card className="p-6 border border-border/50 shadow-sm bg-card">
          <h3 className="font-bold text-foreground flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-green-600" /> Meilleures rotations
          </h3>
          <div className="space-y-2">
            {performance.highRotation.map(p => (
              <div key={p.id} className="flex items-center justify-between text-sm p-2 rounded-lg hover:bg-muted/30">
                <span className="font-semibold truncate">{p.name}</span>
                <span className="text-muted-foreground shrink-0">{p.sold} vendu(s) · {p.stock} en stock</span>
              </div>
            ))}
            {performance.highRotation.length === 0 && <p className="text-sm text-muted-foreground">Pas assez de données.</p>}
          </div>
        </Card>

        {/* Rotations faibles */}
        <Card className="p-6 border border-border/50 shadow-sm bg-card">
          <h3 className="font-bold text-foreground flex items-center gap-2 mb-4">
            <TrendingDown className="w-4 h-4 text-destructive" /> Rotations faibles
          </h3>
          <div className="space-y-2">
            {performance.lowRotation.map(p => (
              <div key={p.id} className="flex items-center justify-between text-sm p-2 rounded-lg hover:bg-muted/30">
                <span className="font-semibold truncate">{p.name}</span>
                <span className="text-muted-foreground shrink-0">{p.sold} vendu(s) · {p.stock} en stock</span>
              </div>
            ))}
            {performance.lowRotation.length === 0 && <p className="text-sm text-muted-foreground">Pas assez de données.</p>}
          </div>
        </Card>
      </div>
    </div>
  )
}
