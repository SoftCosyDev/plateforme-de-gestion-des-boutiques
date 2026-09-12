'use client' // Page interactive (recherche, filtres, détail en popup) — jamais rendue côté serveur.

import React, { useMemo, useState } from 'react' // React + hooks d'état/mémorisation.
import { Receipt, Search, ChevronRight, User, Store, Globe, X } from 'lucide-react' // Icônes.
import { Button } from '@/components/ui/button' // Bouton stylé réutilisable (fermer la popup).
import { Card } from '@/components/ui/card' // Conteneur visuel réutilisable.
import { Input } from '@/components/ui/input' // Champ de saisie stylé réutilisable.
import { Badge } from '@/components/ui/badge' // Petite étiquette stylée (statut, mode de paiement).
import { ApiSale, PaymentMode, SaleStatus, useSales } from '@/lib/queries/sales' // Historique réel des ventes (immuables après création).
import { flattenSellableVariants, useProducts, variantLabel } from '@/lib/queries/products' // Catalogue réel — pour retrouver le nom de chaque ligne vendue.
import { useEmployees } from '@/lib/queries/employees' // Pour afficher le nom du vendeur (Sale.employee n'est qu'un id).
import { useCustomers } from '@/lib/queries/customers' // Pour retrouver un client par fiche quand seul l'id est connu.

// Reprend exactement les libellés déjà utilisés à la Caisse — jamais réinventés ici.
const STATUS_LABELS: Record<SaleStatus, string> = { PAYE: 'Payé', NONPAYE: 'Non payé', PARTIEL: 'Partiel', REMBOURSE: 'Remboursé' }
const STATUS_STYLES: Record<SaleStatus, string> = {
  PAYE: 'bg-green-100 text-green-700 hover:bg-green-100',
  NONPAYE: 'bg-red-100 text-red-700 hover:bg-red-100',
  PARTIEL: 'bg-orange-100 text-orange-700 hover:bg-orange-100',
  REMBOURSE: 'bg-muted text-muted-foreground hover:bg-muted',
}
const PAYMENT_LABELS: Record<PaymentMode, string> = { cash: 'Cash', mobile_money: 'Mobile Money', credit: 'Crédit' }

export default function SalesPage() {
  const { data: sales = [], isLoading, isError } = useSales()
  const { data: products = [] } = useProducts()
  const { data: employees = [] } = useEmployees()
  const { data: customers = [] } = useCustomers()

  const [searchTerm, setSearchTerm] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  // Détail d'une vente affiché en popup (meilleure expérience qu'un dépliant inline sur une
  // liste qui peut être longue) — `null` = aucune popup ouverte.
  const [selectedSale, setSelectedSale] = useState<ApiSale | null>(null)

  // Variantes à plat — sert à retrouver le libellé exact (avec ses attributs) d'une ligne vendue,
  // exactement comme la Caisse/les Commandes/les Achats (voir queries/products.ts).
  const sellableVariants = useMemo(() => flattenSellableVariants(products), [products])
  const variantLabelFor = (line: ApiSale['lines'][number]) => {
    const match = line.variant != null ? sellableVariants.find(sv => sv.variant.id === line.variant) : undefined
    if (match) return match.label
    // Variante depuis supprimée (SET_NULL) -> repli sur le produit seul, toujours connu (PROTECT).
    return products.find(p => p.id === line.product)?.name ?? 'Produit supprimé'
  }

  const employeeName = (id: number | null) => (id != null ? employees.find(e => e.id === id)?.fullName : null) ?? '—'
  const displayCustomerName = (sale: ApiSale) =>
    sale.customerName || (sale.customer != null ? customers.find(c => c.id === sale.customer)?.name : null) || 'Client anonyme'

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    return sales
      .filter(s => {
        const dateKey = (s.soldAt ?? s.createdAt).slice(0, 10)
        const matchesSearch = !term
          || String(s.invoiceNumber ?? '').includes(term)
          || displayCustomerName(s).toLowerCase().includes(term)
        const matchesFrom = !dateFrom || dateKey >= dateFrom
        const matchesTo = !dateTo || dateKey <= dateTo
        return matchesSearch && matchesFrom && matchesTo
      })
      .sort((a, b) => (b.soldAt ?? b.createdAt).localeCompare(a.soldAt ?? a.createdAt))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- displayCustomerName dépend de `customers`, déjà dans les deps.
  }, [sales, searchTerm, dateFrom, dateTo, customers])

  const totalAmount = filtered.reduce((sum, s) => sum + s.total, 0)

  if (isLoading) {
    return <div className="p-12 text-center text-muted-foreground">Chargement des ventes...</div>
  }
  if (isError) {
    return <div className="p-12 text-center text-destructive font-medium">Impossible de charger les ventes. Vérifie que le serveur répond.</div>
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground flex items-center gap-3">
            <Receipt className="w-8 h-8 text-primary" />
            Ventes
          </h1>
          <p className="text-muted-foreground mt-1 text-sm font-medium">
            {filtered.length} vente(s) — {totalAmount.toLocaleString()} FCFA
          </p>
        </div>
      </div>

      <Card className="p-4 border-border/50 shadow-sm bg-card/50">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher par n° de facture ou client..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-11 h-12 rounded-xl"
            />
          </div>
          <div className="flex items-center gap-2">
            <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-12 rounded-xl" />
            <span className="text-xs text-muted-foreground font-bold">à</span>
            <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-12 rounded-xl" />
          </div>
        </div>
      </Card>

      <div className="overflow-hidden rounded-2xl border border-border/50 bg-card shadow-sm divide-y divide-border/40">
        {filtered.map(sale => (
          <button
            key={sale.id}
            type="button"
            onClick={() => setSelectedSale(sale)}
            className="w-full flex flex-wrap items-center gap-3 p-4 text-left hover:bg-muted/30 transition-colors"
          >
            <div className="w-10 h-10 rounded-xl bg-primary/5 border border-primary/10 flex items-center justify-center shrink-0">
              {sale.channel === 'store' ? <Store className="w-4 h-4 text-primary" /> : <Globe className="w-4 h-4 text-primary" />}
            </div>
            {/* min-w-[160px] plutôt que min-w-0+truncate : jamais couper le n° de facture ou le
                nom du client, on préfère un retour à la ligne. */}
            <div className="flex-1 min-w-[160px]">
              <div className="font-bold text-foreground text-sm break-words">
                {sale.invoiceNumber ? `Facture #${sale.invoiceNumber}` : `Vente #${sale.id}`} — {displayCustomerName(sale)}
              </div>
              <div className="flex items-center gap-2 mt-1 flex-wrap text-[13px] text-muted-foreground">
                <span>{new Date(sale.soldAt ?? sale.createdAt).toLocaleString('fr-FR')}</span>
                <span>·</span>
                <span className="flex items-center gap-1"><User className="w-3 h-3" /> {employeeName(sale.employee)}</span>
              </div>
            </div>
            {/* basis-full sur mobile : badges + total + chevron basculent ENTIER sur leur
                propre ligne plutôt que de se fragmenter au milieu de la rangée. */}
            <div className="flex items-center gap-3 basis-full sm:basis-auto justify-between sm:justify-end ml-0 sm:ml-auto">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[12px] font-bold shrink-0 hidden sm:inline-flex">{PAYMENT_LABELS[sale.paymentMode]}</Badge>
                <Badge className={`text-[12px] font-bold shrink-0 ${STATUS_STYLES[sale.status]}`}>{STATUS_LABELS[sale.status]}</Badge>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div className="font-black text-sm w-24 text-right">{sale.total.toLocaleString()} FCFA</div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </div>
            </div>
          </button>
        ))}
        {filtered.length === 0 && (
          <div className="p-12 text-center text-muted-foreground">Aucune vente trouvée.</div>
        )}
      </div>

      {selectedSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setSelectedSale(null)} />
          <Card className="relative w-full max-w-lg shadow-2xl border-border/50 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-border/50 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black">
                  {selectedSale.invoiceNumber ? `Facture #${selectedSale.invoiceNumber}` : `Vente #${selectedSale.id}`}
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">{new Date(selectedSale.soldAt ?? selectedSale.createdAt).toLocaleString('fr-FR')}</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setSelectedSale(null)} className="rounded-full">
                <X className="w-5 h-5" />
              </Button>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="text-[12px] font-bold">{PAYMENT_LABELS[selectedSale.paymentMode]}</Badge>
                <Badge className={`text-[12px] font-bold ${STATUS_STYLES[selectedSale.status]}`}>{STATUS_LABELS[selectedSale.status]}</Badge>
                <Badge variant="outline" className="text-[12px] font-bold">{selectedSale.channel === 'store' ? 'Boutique' : 'En ligne'}</Badge>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-[12px] font-bold text-muted-foreground uppercase">Client</p>
                  <p className="font-semibold">{displayCustomerName(selectedSale)}</p>
                </div>
                <div>
                  <p className="text-[12px] font-bold text-muted-foreground uppercase">Vendeur</p>
                  <p className="font-semibold">{employeeName(selectedSale.employee)}</p>
                </div>
              </div>
              <div className="rounded-xl border border-border/50 overflow-hidden">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="bg-muted/50 border-b border-border/50">
                      <th className="p-2.5 text-[12px] font-bold text-muted-foreground uppercase">Article</th>
                      <th className="p-2.5 text-[12px] font-bold text-muted-foreground uppercase text-center">Qté</th>
                      <th className="p-2.5 text-[12px] font-bold text-muted-foreground uppercase text-right">Prix unit.</th>
                      <th className="p-2.5 text-[12px] font-bold text-muted-foreground uppercase text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {selectedSale.lines.map(line => (
                      <tr key={line.id}>
                        <td className="p-2.5 font-semibold">{variantLabelFor(line)}</td>
                        <td className="p-2.5 text-center">{line.quantity}</td>
                        <td className="p-2.5 text-right text-muted-foreground">{line.unitPrice.toLocaleString()} FCFA</td>
                        <td className="p-2.5 text-right font-bold">{line.lineTotal.toLocaleString()} FCFA</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="space-y-1 text-sm">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Sous-total</span>
                  <span className="font-semibold text-foreground">{selectedSale.subtotal.toLocaleString()} FCFA</span>
                </div>
                {selectedSale.discountAmount > 0 && (
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>Remise</span>
                    <span className="font-semibold text-foreground">-{selectedSale.discountAmount.toLocaleString()} FCFA</span>
                  </div>
                )}
                <div className="flex items-center justify-between pt-1 border-t border-border/40">
                  <span className="font-bold">Total</span>
                  <span className="font-black text-lg text-primary">{selectedSale.total.toLocaleString()} FCFA</span>
                </div>
              </div>
              {selectedSale.paymentMode === 'mobile_money' && selectedSale.mobileMoneyReference && (
                <p className="text-xs text-muted-foreground">Réf. Mobile Money : <span className="font-mono font-semibold text-foreground">{selectedSale.mobileMoneyReference}</span></p>
              )}
              {selectedSale.notes && (
                <p className="text-xs text-muted-foreground">Notes : {selectedSale.notes}</p>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
