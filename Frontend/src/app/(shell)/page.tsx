'use client' // Page interactive (aucune donnée statique) — jamais rendue côté serveur.

import React, { useMemo, useState } from 'react' // React + hooks d'état/mémorisation.
import {
  TrendingUp, TrendingDown, Package, AlertTriangle, Wallet, Clock, Activity, RefreshCcw,
  Receipt, ArrowLeft, LucideIcon,
} from 'lucide-react' // Icônes.
import { Card } from '@/components/ui/card' // Conteneur visuel réutilisable.
import { Badge } from '@/components/ui/badge' // Petite étiquette stylée.
import { flattenSellableVariants, useProducts } from '@/lib/queries/products' // Catalogue réel — sert au calcul "péremption proche", au détail Produits/Valeur du stock, ET au coût d'achat pour le Bénéfice.
import { useCustomers } from '@/lib/queries/customers' // Clients réels — sert à la liste "ardoise".
import { useSales } from '@/lib/queries/sales' // Ventes réelles — sert aux détails Vente du jour/Remboursements/Bénéfice.
import { useDashboardRecentData, useDashboardSummary } from '@/lib/queries/reports' // Agrégats calculés côté serveur.

// Une des 6 cartes KPI cliquables — `null` = aucune sélectionnée (vue par défaut).
type CardKey = 'products' | 'stockValue' | 'alerts' | 'profit' | 'todaySales' | 'refunds'

const CARD_TITLES: Record<CardKey, string> = {
  products: 'Détail des produits',
  stockValue: 'Valeur du stock par produit',
  alerts: 'Alertes de stock actives',
  profit: 'Bénéfice par mois',
  todaySales: 'Ventes du jour',
  refunds: 'Remboursements du jour',
}

// Une carte KPI cliquable — factorisée une seule fois plutôt que répétée 6 fois (voir plus bas).
interface KpiCardProps {
  icon: LucideIcon
  iconBg: string
  iconColor: string
  label: string
  value: React.ReactNode
  active: boolean
  onClick: () => void
}
function KpiCard({ icon: Icon, iconBg, iconColor, label, value, active, onClick }: KpiCardProps) {
  return (
    <Card
      onClick={onClick}
      className={`p-6 shadow-sm bg-card cursor-pointer transition-all hover:shadow-md hover:border-primary/40 ${
        active ? 'border-2 border-primary' : 'border border-border/50'
      }`}
    >
      <div className="flex items-center gap-3 sm:gap-4">
        <div className={`w-11 h-11 sm:w-12 sm:h-12 rounded-xl ${iconBg} flex items-center justify-center shrink-0`}><Icon className={`w-5 h-5 sm:w-6 sm:h-6 ${iconColor}`} /></div>
        {/* Jamais de `truncate` sur un montant : on préfère un chiffre qui passe à la ligne
            plutôt qu'un chiffre coupé (perdre un "0" en fin de nombre serait trompeur). */}
        <div className="min-w-0"><p className="text-[13px] sm:text-xs font-bold text-muted-foreground uppercase tracking-wider">{label}</p><p className="text-lg sm:text-xl font-black text-foreground break-words leading-tight">{value}</p></div>
      </div>
    </Card>
  )
}

export default function DashboardPage() {
  const { data: summary, isLoading: summaryLoading } = useDashboardSummary()
  const { data: recent, isLoading: recentLoading } = useDashboardRecentData()
  const { data: products = [] } = useProducts()
  const { data: customers = [] } = useCustomers()
  const { data: sales = [] } = useSales()

  // Carte KPI actuellement "ouverte" — remplace TOUT le contenu par défaut ci-dessous par le
  // détail de cette seule carte (jamais affiché EN PLUS, pour ne rien dupliquer sur la page).
  const [activeCard, setActiveCard] = useState<CardKey | null>(null)

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

  // Lomé (Togo) est en GMT+0 toute l'année -> la date UTC du navigateur coïncide avec la date
  // locale, donc pas besoin d'une librairie de fuseaux horaires pour ce simple filtre d'affichage
  // (le CHIFFRE affiché sur la carte KPI, lui, vient toujours du serveur — voir summary.todaySalesAmount).
  const todayKey = new Date().toISOString().slice(0, 10)
  const todaySales = useMemo(
    () => sales.filter(s => (s.soldAt ?? s.createdAt).slice(0, 10) === todayKey).sort((a, b) => (b.soldAt ?? b.createdAt).localeCompare(a.soldAt ?? a.createdAt)),
    [sales, todayKey],
  )
  const todayRefundSales = useMemo(
    () => sales.filter(s => s.status === 'REMBOURSE' && (s.soldAt ?? s.createdAt).slice(0, 10) === todayKey),
    [sales, todayKey],
  )
  const productsByStockValue = useMemo(() => (
    products
      .map(p => ({
        product: p,
        stock: p.variants.reduce((sum, v) => sum + v.stock.availableQty, 0),
        value: p.variants.reduce((sum, v) => sum + v.stock.availableQty * v.sellingPrice, 0),
      }))
      .sort((a, b) => b.value - a.value)
  ), [products])
  // Coût d'achat par variante — pour calculer un vrai bénéfice (revenu - coût), pas juste le CA.
  const sellableVariants = useMemo(() => flattenSellableVariants(products), [products])
  const monthlyProfit = useMemo(() => {
    const totals = new Map<string, number>()
    for (const s of sales) {
      const key = (s.soldAt ?? s.createdAt).slice(0, 7) // "YYYY-MM"
      let saleProfit = 0
      for (const line of s.lines) {
        const costPrice = sellableVariants.find(sv => sv.variant.id === line.variant)?.variant.costPrice
        // Variante depuis supprimée (SET_NULL) -> coût d'origine inconnu -> ligne exclue, comme
        // côté serveur (voir Backend/reports/views.py::DashboardSummaryView).
        if (costPrice == null) continue
        saleProfit += line.lineTotal - line.quantity * costPrice
      }
      totals.set(key, (totals.get(key) ?? 0) + saleProfit)
    }
    return [...totals.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 6)
  }, [sales, sellableVariants])

  if (summaryLoading || recentLoading || !summary || !recent) {
    return <div className="p-12 text-center text-muted-foreground">Chargement du tableau de bord...</div>
  }

  const toggleCard = (key: CardKey) => setActiveCard(prev => (prev === key ? null : key))

  const renderDetail = () => {
    switch (activeCard) {
      case 'products':
        return (
          <div className="overflow-x-auto rounded-2xl border border-border/50 bg-card shadow-xl">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-muted/50 border-b border-border/50">
                  <th className="p-3 text-xs font-bold text-muted-foreground uppercase">Produit</th>
                  <th className="p-3 text-xs font-bold text-muted-foreground uppercase">Catégorie</th>
                  <th className="p-3 text-xs font-bold text-muted-foreground uppercase text-center">Variantes</th>
                  <th className="p-3 text-xs font-bold text-muted-foreground uppercase text-center">Stock total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {products.map(p => (
                  <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                    <td className="p-3 font-semibold flex items-center gap-2">{p.emoji} {p.name}</td>
                    <td className="p-3 text-muted-foreground">{p.category.name}</td>
                    <td className="p-3 text-center">{p.variants.length}</td>
                    <td className="p-3 text-center font-black">{p.variants.reduce((sum, v) => sum + v.stock.availableQty, 0)}</td>
                  </tr>
                ))}
                {products.length === 0 && <tr><td colSpan={4} className="p-12 text-center text-muted-foreground">Aucun produit.</td></tr>}
              </tbody>
            </table>
          </div>
        )
      case 'stockValue':
        return (
          <div className="overflow-x-auto rounded-2xl border border-border/50 bg-card shadow-xl">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-muted/50 border-b border-border/50">
                  <th className="p-3 text-xs font-bold text-muted-foreground uppercase">Produit</th>
                  <th className="p-3 text-xs font-bold text-muted-foreground uppercase text-center">Stock</th>
                  <th className="p-3 text-xs font-bold text-muted-foreground uppercase text-right">Valeur</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {productsByStockValue.map(({ product, stock, value }) => (
                  <tr key={product.id} className="hover:bg-muted/30 transition-colors">
                    <td className="p-3 font-semibold flex items-center gap-2">{product.emoji} {product.name}</td>
                    <td className="p-3 text-center">{stock}</td>
                    <td className="p-3 text-right font-black">{value.toLocaleString()} FCFA</td>
                  </tr>
                ))}
                {productsByStockValue.length === 0 && <tr><td colSpan={3} className="p-12 text-center text-muted-foreground">Aucun produit.</td></tr>}
              </tbody>
            </table>
          </div>
        )
      case 'alerts':
        return (
          <Card className="p-6 border border-border/50 shadow-sm bg-card">
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
        )
      case 'profit':
        return (
          <Card className="p-6 border border-border/50 shadow-sm bg-card">
            <div className="space-y-2">
              {monthlyProfit.length === 0 && <p className="text-sm text-muted-foreground">Aucune vente enregistrée.</p>}
              {monthlyProfit.map(([month, total]) => (
                <div key={month} className="flex items-center justify-between p-3 rounded-xl bg-muted/20 border border-border/40">
                  <span className="text-sm font-semibold">{new Date(`${month}-01`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</span>
                  <span className={`font-black text-sm ${total >= 0 ? 'text-green-600' : 'text-destructive'}`}>{total.toLocaleString()} FCFA</span>
                </div>
              ))}
            </div>
          </Card>
        )
      case 'todaySales':
        return (
          <div className="overflow-x-auto rounded-2xl border border-border/50 bg-card shadow-xl">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-muted/50 border-b border-border/50">
                  <th className="p-3 text-xs font-bold text-muted-foreground uppercase">Facture</th>
                  <th className="p-3 text-xs font-bold text-muted-foreground uppercase">Client</th>
                  <th className="p-3 text-xs font-bold text-muted-foreground uppercase">Heure</th>
                  <th className="p-3 text-xs font-bold text-muted-foreground uppercase text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {todaySales.map(s => (
                  <tr key={s.id} className="hover:bg-muted/30 transition-colors">
                    <td className="p-3 font-semibold">{s.invoiceNumber ? `#${s.invoiceNumber}` : `#${s.id}`}</td>
                    <td className="p-3">{s.customerName || 'Client anonyme'}</td>
                    <td className="p-3 text-muted-foreground">{new Date(s.soldAt ?? s.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</td>
                    <td className="p-3 text-right font-black">{s.total.toLocaleString()} FCFA</td>
                  </tr>
                ))}
                {todaySales.length === 0 && <tr><td colSpan={4} className="p-12 text-center text-muted-foreground">Aucune vente aujourd&apos;hui.</td></tr>}
              </tbody>
            </table>
          </div>
        )
      case 'refunds':
        return (
          <div className="overflow-x-auto rounded-2xl border border-border/50 bg-card shadow-xl">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-muted/50 border-b border-border/50">
                  <th className="p-3 text-xs font-bold text-muted-foreground uppercase">Facture</th>
                  <th className="p-3 text-xs font-bold text-muted-foreground uppercase">Client</th>
                  <th className="p-3 text-xs font-bold text-muted-foreground uppercase text-right">Montant</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {todayRefundSales.map(s => (
                  <tr key={s.id} className="hover:bg-muted/30 transition-colors">
                    <td className="p-3 font-semibold">{s.invoiceNumber ? `#${s.invoiceNumber}` : `#${s.id}`}</td>
                    <td className="p-3">{s.customerName || 'Client anonyme'}</td>
                    <td className="p-3 text-right font-black text-destructive">{s.total.toLocaleString()} FCFA</td>
                  </tr>
                ))}
                {todayRefundSales.length === 0 && <tr><td colSpan={3} className="p-12 text-center text-muted-foreground">Aucun remboursement aujourd&apos;hui.</td></tr>}
              </tbody>
            </table>
          </div>
        )
      default:
        return null
    }
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

      {/* KPI — cliquables : chacune ouvre son détail à la place de la section par défaut plus bas. */}
      {/* Jamais plus de 3 colonnes, même sur un très grand écran : au-delà, chaque carte
          redevient trop étroite pour un montant en FCFA (vérifié — 6 colonnes coupait déjà
          les valeurs même à 1536px de large). Mieux vaut 2 rangées lisibles qu'une rangée serrée. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        <KpiCard
          icon={Package} iconBg="bg-primary/10" iconColor="text-primary" label="Produits"
          value={summary.totalProducts} active={activeCard === 'products'} onClick={() => toggleCard('products')}
        />
        <KpiCard
          icon={Wallet} iconBg="bg-secondary/20" iconColor="text-secondary-foreground" label="Valeur du stock"
          value={`${summary.totalStockValue.toLocaleString()} FCFA`} active={activeCard === 'stockValue'} onClick={() => toggleCard('stockValue')}
        />
        <KpiCard
          icon={AlertTriangle} iconBg="bg-orange-500/10" iconColor="text-orange-500" label="Alertes actives"
          value={summary.activeAlerts} active={activeCard === 'alerts'} onClick={() => toggleCard('alerts')}
        />
        <KpiCard
          icon={TrendingUp} iconBg="bg-green-500/10" iconColor="text-green-600" label="Bénéfice"
          value={`${summary.totalProfit.toLocaleString()} FCFA`} active={activeCard === 'profit'} onClick={() => toggleCard('profit')}
        />
        <KpiCard
          icon={Receipt} iconBg="bg-blue-500/10" iconColor="text-blue-600" label="Vente du jour"
          value={`${summary.todaySalesCount} · ${summary.todaySalesAmount.toLocaleString()} FCFA`}
          active={activeCard === 'todaySales'} onClick={() => toggleCard('todaySales')}
        />
        <KpiCard
          icon={RefreshCcw} iconBg="bg-destructive/10" iconColor="text-destructive" label="Remboursements (jour)"
          value={summary.todayRefunds} active={activeCard === 'refunds'} onClick={() => toggleCard('refunds')}
        />
      </div>

      {activeCard ? (
        // Détail d'UNE carte — remplace tout ce qui suit habituellement, jamais affiché en plus
        // (une carte détaillée ici ne doit jamais répéter une section déjà visible ailleurs).
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold flex items-center gap-2 px-2">{CARD_TITLES[activeCard]}</h2>
            <button
              type="button" onClick={() => setActiveCard(null)}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors px-2"
            >
              <ArrowLeft className="w-4 h-4" /> Retour
            </button>
          </div>
          {renderDetail()}
        </div>
      ) : (
        <>
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
                        <Badge className={`rounded-lg text-[11px] font-black uppercase ${
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
        </>
      )}
    </div>
  )
}
