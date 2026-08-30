'use client' // Page interactive (aucune donnée statique) — jamais rendue côté serveur.

import React, { useMemo } from 'react' // React + mémorisation des dérivés locaux.
import { TrendingUp, TrendingDown, Package, AlertTriangle, Wallet, Clock, Activity, RefreshCcw } from 'lucide-react' // Icônes.
import { Card } from '@/components/ui/card' // Conteneur visuel réutilisable.
import { Badge } from '@/components/ui/badge' // Petite étiquette stylée.
import { useProducts } from '@/lib/queries/products' // Catalogue réel — sert au calcul "péremption proche".
import { useCustomers } from '@/lib/queries/customers' // Clients réels — sert à la liste "ardoise".
import { useDashboardRecentData, useDashboardSummary } from '@/lib/queries/reports' // Agrégats calculés côté serveur.

export default function DashboardPage() {
  const { data: summary, isLoading: summaryLoading } = useDashboardSummary()
  const { data: recent, isLoading: recentLoading } = useDashboardRecentData()
  const { data: products = [] } = useProducts()
  const { data: customers = [] } = useCustomers()

  // Péremption proche : filtre côté client d'une liste déjà réelle (le serveur n'agrège pas
  // ceci) — pas un recalcul d'agrégat métier, juste une lecture directe de champs déjà exacts.
  const expiringSoon = useMemo(() => {
    const in30Days = new Date()
    in30Days.setDate(in30Days.getDate() + 30)
    return products.filter(p => p.expirationDate && new Date(p.expirationDate) <= in30Days)
  }, [products])

  // Ardoise clients : même principe — `balanceDue` est déjà exact côté serveur (Phase 3), on ne
  // fait ici que filtrer/trier une liste réelle, pas recalculer un solde.
  const debtors = useMemo(
    () => [...customers].filter(c => c.balanceDue > 0).sort((a, b) => b.balanceDue - a.balanceDue),
    [customers],
  )

  if (summaryLoading || recentLoading || !summary || !recent) {
    return <div className="p-12 text-center text-muted-foreground">Chargement du tableau de bord...</div>
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground flex items-center gap-3">
          <TrendingUp className="w-8 h-8 text-primary" />
          Tableau de bord
        </h1>
        <p className="text-muted-foreground mt-1 text-sm font-medium">Vue d'ensemble de la boutique</p>
      </div>

      {/* KPI — les 5 agrégats calculés côté serveur, jamais recalculés ici */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="p-6 border border-border/50 shadow-sm bg-card">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center"><Package className="w-6 h-6 text-primary" /></div>
            <div><p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Produits</p><p className="text-2xl font-black text-foreground">{summary.totalProducts}</p></div>
          </div>
        </Card>
        <Card className="p-6 border border-border/50 shadow-sm bg-card">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-secondary/20 flex items-center justify-center"><Wallet className="w-6 h-6 text-secondary-foreground" /></div>
            <div><p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Valeur du stock</p><p className="text-2xl font-black text-foreground">{summary.totalStockValue.toLocaleString()} FCFA</p></div>
          </div>
        </Card>
        <Card className="p-6 border border-border/50 shadow-sm bg-card">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-orange-500/10 flex items-center justify-center"><AlertTriangle className="w-6 h-6 text-orange-500" /></div>
            <div><p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Alertes actives</p><p className="text-2xl font-black text-foreground">{summary.activeAlerts}</p></div>
          </div>
        </Card>
        <Card className="p-6 border border-border/50 shadow-sm bg-card">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center"><TrendingUp className="w-6 h-6 text-green-600" /></div>
            <div><p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">CA total</p><p className="text-2xl font-black text-foreground">{summary.totalSalesAmount.toLocaleString()} FCFA</p></div>
          </div>
        </Card>
        <Card className="p-6 border border-border/50 shadow-sm bg-card">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-destructive/10 flex items-center justify-center"><RefreshCcw className="w-6 h-6 text-destructive" /></div>
            <div><p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Remboursements (jour)</p><p className="text-2xl font-black text-foreground">{summary.todayRefunds}</p></div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Alertes de stock */}
        <Card className="p-6 border border-border/50 shadow-sm bg-card">
          <h3 className="font-bold text-foreground flex items-center gap-2 mb-4">
            <AlertTriangle className="w-4 h-4 text-orange-500" /> Alertes de stock
          </h3>
          <div className="space-y-2">
            {recent.lowStock.length === 0 && <p className="text-sm text-muted-foreground">Rien à signaler.</p>}
            {recent.lowStock.map((a, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-muted/20 border border-border/40">
                <span className="text-sm font-semibold">{a.message}</span>
                <Badge className={a.severity === 'critical' ? 'bg-destructive/15 text-destructive hover:bg-destructive/15' : 'bg-orange-100 text-orange-700 hover:bg-orange-100'}>
                  {a.availableQty}
                </Badge>
              </div>
            ))}
          </div>
        </Card>

        {/* Ardoise clients */}
        <Card className="p-6 border border-border/50 shadow-sm bg-card">
          <h3 className="font-bold text-foreground flex items-center gap-2 mb-4">
            <Wallet className="w-4 h-4 text-destructive" /> Ardoise clients
          </h3>
          <div className="space-y-2">
            {debtors.length === 0 && <p className="text-sm text-muted-foreground">Aucun client endetté.</p>}
            {debtors.slice(0, 8).map(c => (
              <div key={c.id} className="flex items-center justify-between p-3 rounded-xl bg-muted/20 border border-border/40">
                <div>
                  <p className="text-sm font-semibold">{c.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">{c.phone}</p>
                </div>
                <p className="font-black text-destructive">{c.balanceDue.toLocaleString()} FCFA</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Péremption proche */}
      <Card className="p-6 border border-border/50 shadow-sm bg-card">
        <h3 className="font-bold text-foreground flex items-center gap-2 mb-4">
          <Clock className="w-4 h-4 text-accent" />
          Péremption proche (30 jours)
        </h3>
        <div className="space-y-2">
          {expiringSoon.length === 0 && <p className="text-sm text-muted-foreground">Rien à signaler.</p>}
          {expiringSoon.map(p => (
            <div key={p.id} className="flex items-center justify-between p-3 rounded-xl bg-accent/5 border border-accent/20">
              <span className="text-sm font-semibold flex items-center gap-2">{p.emoji} {p.name}</span>
              <Badge className="bg-accent/15 text-accent hover:bg-accent/15">
                {new Date(p.expirationDate!).toLocaleDateString('fr-FR')}
              </Badge>
            </div>
          ))}
        </div>
      </Card>

      {/* Historique des mouvements — 5 plus récents, calculés côté serveur */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold flex items-center gap-2 px-2">
          <Activity className="w-5 h-5 text-primary" />
          Historique des Mouvements
        </h2>
        <div className="overflow-x-auto rounded-2xl border border-border/50 bg-card shadow-xl">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-muted/50 border-b border-border/50">
                <th className="p-3 text-xs font-bold text-muted-foreground uppercase">Produit</th>
                <th className="p-3 text-xs font-bold text-muted-foreground uppercase text-center">Type</th>
                <th className="p-3 text-xs font-bold text-muted-foreground uppercase text-center">Qté</th>
                <th className="p-3 text-xs font-bold text-muted-foreground uppercase">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {recent.movements.map((m, i) => (
                <tr key={i} className="hover:bg-muted/30 transition-colors">
                  <td className="p-3 font-semibold">{m.productName}</td>
                  <td className="p-3 text-center">
                    <Badge className={`rounded-lg text-[9px] font-black uppercase ${
                      m.type === 'ENTREE' ? 'bg-green-100 text-green-700 hover:bg-green-100' :
                      m.type === 'SORTIE' ? 'bg-red-100 text-red-700 hover:bg-red-100' :
                      'bg-orange-100 text-orange-700 hover:bg-orange-100'
                    }`}>
                      {m.type === 'ENTREE' ? <TrendingUp className="w-3 h-3 mr-1 inline" /> : m.type === 'SORTIE' ? <TrendingDown className="w-3 h-3 mr-1 inline" /> : <AlertTriangle className="w-3 h-3 mr-1 inline" />}
                      {m.type}
                    </Badge>
                  </td>
                  <td className="p-3 text-center font-black">{m.qty}</td>
                  <td className="p-3 text-muted-foreground">{new Date(m.date).toLocaleDateString('fr-FR')}</td>
                </tr>
              ))}
              {recent.movements.length === 0 && (
                <tr><td colSpan={4} className="p-12 text-center text-muted-foreground">Aucun mouvement enregistré.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
