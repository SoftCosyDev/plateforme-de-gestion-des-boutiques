'use client' // Page interactive (sessions de comptage, saisie) — jamais rendue côté serveur.

import React, { useMemo, useState } from 'react' // React + hooks d'état/mémorisation.
import {
  ClipboardList, Plus, ArrowLeft, X, Save, CheckCircle2, Clock, Calendar,
  Search, ChevronRight, Minus,
} from 'lucide-react' // Icônes.
import { Card } from '@/components/ui/card' // Conteneur visuel réutilisable.
import { Button } from '@/components/ui/button' // Bouton stylé réutilisable.
import { Input } from '@/components/ui/input' // Champ de saisie stylé réutilisable.
import { Badge } from '@/components/ui/badge' // Petite étiquette stylée.
import { flattenSellableVariants, useProducts } from '@/lib/queries/products' // Catalogue réel (variantes).
import {
  ApiInventoryCount, ApiInventoryLine, InventoryStatus, useCreateInventoryCount, useFinishInventoryCount, useInventoryCounts, useUpdateInventoryLine,
} from '@/lib/queries/inventory' // Inventaire réel — expected_qty/discrepancy calculés côté serveur.

function defaultNotes() {
  return `Inventaire du ${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`
}

const STATUS_FILTERS: { id: 'all' | InventoryStatus; label: string }[] = [
  { id: 'all', label: 'Tous les statuts' },
  { id: 'en_cours', label: 'En cours' },
  { id: 'termine', label: 'Terminé' },
]

export default function InventoryPage() {
  const { data: products = [] } = useProducts()
  const { data: counts = [], isLoading, isError } = useInventoryCounts()
  const createCount = useCreateInventoryCount()
  const updateLine = useUpdateInventoryLine()
  const finishCount = useFinishInventoryCount()

  const [activeId, setActiveId] = useState<number | null>(null)
  const [isNewModalOpen, setIsNewModalOpen] = useState(false)
  const [newNotes, setNewNotes] = useState('')
  // Sélection à l'échelle de LA variante (pas du produit) — un produit à déclinaisons doit
  // pouvoir compter chaque taille/couleur séparément, chacune avec son propre stock à vérifier.
  const [selectedVariantIds, setSelectedVariantIds] = useState<Set<number>>(new Set())
  const [creating, setCreating] = useState(false)
  const [listSearch, setListSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | InventoryStatus>('all')
  const [countSearch, setCountSearch] = useState('')

  const sorted = useMemo(() => [...counts].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [counts])
  const active = sorted.find(i => i.id === activeId) || null

  const sellableVariants = useMemo(() => flattenSellableVariants(products), [products])
  const productInfo = (productId: number) => products.find(p => p.id === productId)
  // Une ligne d'inventaire garde sa propre variante (`line.variant`, nullable si la variante a
  // depuis été supprimée — voir InventoryLine.variant, on_delete=SET_NULL) — jamais juste "la
  // première variante du produit", sous peine d'afficher le même nom/code pour chaque
  // déclinaison d'un même produit à plusieurs variantes.
  const variantInfoForLine = (line: ApiInventoryLine) =>
    line.variant != null ? sellableVariants.find(sv => sv.variant.id === line.variant) : undefined

  const filteredSessions = useMemo(() => {
    const term = listSearch.trim().toLowerCase()
    return sorted.filter(inv => {
      const matchesStatus = statusFilter === 'all' || inv.status === statusFilter
      const matchesSearch = !term || inv.notes.toLowerCase().includes(term)
      return matchesStatus && matchesSearch
    })
  }, [sorted, listSearch, statusFilter])

  const openNewModal = () => {
    setNewNotes(defaultNotes())
    // Par défaut, toutes les variantes sont proposées au comptage (comme avant) — décochables une par une.
    setSelectedVariantIds(new Set(sellableVariants.map(sv => sv.variant.id)))
    setIsNewModalOpen(true)
  }
  const closeNewModal = () => setIsNewModalOpen(false)

  const toggleVariant = (variantId: number) => {
    setSelectedVariantIds(prev => {
      const next = new Set(prev)
      if (next.has(variantId)) next.delete(variantId)
      else next.add(variantId)
      return next
    })
  }

  const submitNew = async (e: React.FormEvent) => {
    e.preventDefault()
    const variantIds = [...selectedVariantIds]
    if (variantIds.length === 0) return
    setCreating(true)
    try {
      const created = await createCount.mutateAsync({ notes: newNotes.trim() || defaultNotes(), variantIds })
      closeNewModal()
      setCountSearch('')
      setActiveId(created.id)
    } finally {
      setCreating(false)
    }
  }

  const handleFinalize = async () => {
    if (!active) return
    if (!confirm("Terminer cet inventaire ? Le stock sera ajusté selon les quantités comptées et la session sera verrouillée.")) return
    await finishCount.mutateAsync(active.id)
  }

  const stepCount = (lineId: number, currentCounted: number | null, expected: number, delta: number) => {
    const base = currentCounted ?? expected
    updateLine.mutate({ id: lineId, countedQty: Math.max(0, base + delta) })
  }

  if (active) {
    const countedCount = active.lines.filter(l => l.countedQty !== null).length
    const discrepancies = active.lines.filter(l => l.countedQty !== null && l.discrepancy !== 0).length
    const isLocked = active.status === 'termine'
    const visibleLines = active.lines.filter(l => {
      if (!countSearch.trim()) return true
      const name = variantInfoForLine(l)?.label || productInfo(l.product)?.name || ''
      return name.toLowerCase().includes(countSearch.trim().toLowerCase())
    })

    return (
      <div className="p-4 md:p-6 lg:p-8 space-y-6">
        <button
          type="button"
          onClick={() => setActiveId(null)}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Retour aux inventaires
        </button>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-foreground flex items-center gap-3">
              {active.notes}
              <Badge className={isLocked ? 'bg-green-100 text-green-700 hover:bg-green-100' : 'bg-orange-100 text-orange-700 hover:bg-orange-100'}>
                {isLocked ? 'Terminé' : 'En cours'}
              </Badge>
            </h1>
            <p className="text-muted-foreground mt-1 text-sm font-medium flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              Créé le {new Date(active.createdAt).toLocaleDateString('fr-FR')}
              {' · '}{countedCount}/{active.lines.length} produit(s) compté(s) · {discrepancies} écart(s)
            </p>
          </div>
          {!isLocked && (
            <Button onClick={handleFinalize} disabled={finishCount.isPending} className="rounded-xl px-5 h-11 gap-2 font-bold shrink-0">
              <CheckCircle2 className="w-4 h-4" /> Finaliser l'inventaire
            </Button>
          )}
        </div>

        <Card className="p-4 border-border/50 shadow-sm bg-card/50">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher un produit à compter..."
              value={countSearch}
              onChange={e => setCountSearch(e.target.value)}
              className="pl-11 h-12 rounded-xl"
            />
          </div>
        </Card>

        <div className="overflow-x-auto rounded-2xl border border-border/50 bg-card shadow-xl">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-muted/50 border-b border-border/50">
                <th className="p-4 text-xs font-bold text-muted-foreground uppercase">Produit / Code-barres</th>
                <th className="p-4 text-xs font-bold text-muted-foreground uppercase text-center">Attendu</th>
                <th className="p-4 text-xs font-bold text-muted-foreground uppercase text-center">Compté</th>
                <th className="p-4 text-xs font-bold text-muted-foreground uppercase text-center">Écart</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {visibleLines.map(line => (
                <tr key={line.id} className="hover:bg-muted/30 transition-colors">
                  <td className="p-4">
                    <div className="font-semibold text-sm">{variantInfoForLine(line)?.label || productInfo(line.product)?.name || 'Produit supprimé'}</div>
                    <div className="font-mono text-[12px] text-muted-foreground">{variantInfoForLine(line)?.variant.barcode || '—'}</div>
                  </td>
                  <td className="p-4 text-center text-sm text-muted-foreground">{line.expectedQty}</td>
                  <td className="p-4">
                    {isLocked ? (
                      <div className="text-center font-bold">{line.countedQty ?? '—'}</div>
                    ) : (
                      <div className="flex items-center justify-center gap-2">
                        <Button
                          type="button" variant="outline" size="icon" className="h-8 w-8 rounded-lg shrink-0"
                          onClick={() => stepCount(line.id, line.countedQty, line.expectedQty, -1)}
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </Button>
                        <Input
                          type="number"
                          min="0"
                          defaultValue={line.countedQty ?? ''}
                          key={`${line.id}-${line.countedQty}`}
                          placeholder={String(line.expectedQty)}
                          onBlur={e => {
                            if (e.target.value === '') return
                            updateLine.mutate({ id: line.id, countedQty: Math.max(0, Number(e.target.value)) })
                          }}
                          className="h-9 w-16 text-center"
                        />
                        <Button
                          type="button" variant="outline" size="icon" className="h-8 w-8 rounded-lg shrink-0"
                          onClick={() => stepCount(line.id, line.countedQty, line.expectedQty, 1)}
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    )}
                  </td>
                  <td className="p-4 text-center">
                    {line.countedQty === null ? (
                      <span className="text-muted-foreground text-sm">—</span>
                    ) : line.discrepancy === 0 ? (
                      <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Conforme</Badge>
                    ) : (
                      <Badge className={(line.discrepancy || 0) > 0 ? 'bg-blue-100 text-blue-700 hover:bg-blue-100' : 'bg-red-100 text-red-700 hover:bg-red-100'}>
                        {(line.discrepancy || 0) > 0 ? '+' : ''}{line.discrepancy}
                      </Badge>
                    )}
                  </td>
                </tr>
              ))}
              {visibleLines.length === 0 && (
                <tr><td colSpan={4} className="p-12 text-center text-muted-foreground">Aucun produit trouvé.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return <div className="p-12 text-center text-muted-foreground">Chargement de l'inventaire...</div>
  }
  if (isError) {
    return <div className="p-12 text-center text-destructive font-medium">Impossible de charger l'inventaire. Vérifie que le serveur répond.</div>
  }

  const totalSessions = counts.length
  const enCoursCount = counts.filter(i => i.status === 'en_cours').length
  const termineCount = counts.filter(i => i.status === 'termine').length

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground flex items-center gap-3">
            <ClipboardList className="w-8 h-8 text-primary" />
            Inventaire
          </h1>
          <p className="text-muted-foreground mt-1 text-sm font-medium">Comptages physiques du stock, période par période</p>
        </div>
        <Button onClick={openNewModal} className="rounded-xl px-6 h-12 gap-2 font-bold">
          <Plus className="w-5 h-5" />
          Nouvel inventaire
        </Button>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-6 border border-border/50 shadow-sm bg-card">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center"><ClipboardList className="w-6 h-6 text-primary" /></div>
            <div><p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Total sessions</p><p className="text-2xl font-black">{totalSessions}</p></div>
          </div>
        </Card>
        <Card className="p-6 border border-border/50 shadow-sm bg-card">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-orange-500/10 flex items-center justify-center"><Clock className="w-6 h-6 text-orange-500" /></div>
            <div><p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">En cours</p><p className="text-2xl font-black">{enCoursCount}</p></div>
          </div>
        </Card>
        <Card className="p-6 border border-border/50 shadow-sm bg-card">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center"><CheckCircle2 className="w-6 h-6 text-green-600" /></div>
            <div><p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Terminés</p><p className="text-2xl font-black">{termineCount}</p></div>
          </div>
        </Card>
      </div>

      {/* Recherche + filtre statut */}
      <Card className="p-4 border-border/50 shadow-sm bg-card/50">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher par note..."
              value={listSearch}
              onChange={e => setListSearch(e.target.value)}
              className="pl-11 h-12 rounded-xl"
            />
          </div>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as 'all' | InventoryStatus)}
            className="h-12 px-4 rounded-xl border border-border/50 bg-background text-sm font-bold"
          >
            {STATUS_FILTERS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
        </div>
      </Card>

      {/* Grille des sessions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {filteredSessions.map((inv: ApiInventoryCount) => {
          const discrepancies = inv.lines.filter(l => l.countedQty !== null && l.discrepancy !== 0).length
          const isLocked = inv.status === 'termine'
          return (
            <Card
              key={inv.id}
              onClick={() => { setCountSearch(''); setActiveId(inv.id) }}
              className="relative p-6 border-border/50 shadow-sm bg-card cursor-pointer hover:border-primary/40 hover:shadow-md transition-all"
            >
              <Badge className={`absolute top-6 right-6 ${isLocked ? 'bg-green-100 text-green-700 hover:bg-green-100' : 'bg-orange-100 text-orange-700 hover:bg-orange-100'}`}>
                {isLocked ? 'Terminé' : 'En cours'}
              </Badge>
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
                <ClipboardList className="w-5 h-5 text-primary" />
              </div>
              <h3 className="font-bold text-foreground pr-24">{inv.notes}</h3>
              <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1">
                <Calendar className="w-3 h-3" /> {new Date(inv.createdAt).toLocaleDateString('fr-FR')}
              </p>
              <div className="flex items-center gap-6 mt-4 pt-4 border-t border-border/40">
                <div>
                  <p className="text-[12px] text-muted-foreground uppercase font-bold">Produits</p>
                  <p className="text-lg font-black">{inv.lines.length}</p>
                </div>
                <div>
                  <p className="text-[12px] text-muted-foreground uppercase font-bold">Écart</p>
                  <p className={`text-lg font-black ${discrepancies > 0 ? 'text-destructive' : 'text-green-600'}`}>{discrepancies}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 ml-auto" />
              </div>
            </Card>
          )
        })}
        {filteredSessions.length === 0 && (
          <div className="col-span-full p-12 text-center text-muted-foreground rounded-2xl border border-dashed border-border/50">
            Aucun inventaire trouvé.
          </div>
        )}
      </div>

      {isNewModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeNewModal} />
          <Card className="relative w-full max-w-md shadow-2xl border-border/50 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-border/50 flex items-center justify-between">
              <h2 className="text-xl font-black">Nouvel inventaire</h2>
              <Button variant="ghost" size="icon" onClick={closeNewModal} className="rounded-full"><X className="w-5 h-5" /></Button>
            </div>
            <form onSubmit={submitNew} className="p-6 space-y-4">
              <p className="text-sm text-muted-foreground">
                Le stock système actuel de chaque produit sélectionné sera pris comme référence — tu pourras ensuite saisir la quantité réellement comptée pour chacun.
              </p>
              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase">Note</label>
                <Input required value={newNotes} onChange={e => setNewNotes(e.target.value)} className="h-11" autoFocus />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase">
                  Variantes à compter ({selectedVariantIds.size}/{sellableVariants.length})
                </label>
                <div className="max-h-48 overflow-y-auto border border-border/50 rounded-xl divide-y divide-border/40">
                  {sellableVariants.map(({ product, variant, label }) => (
                    <label key={variant.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-muted/30">
                      <input
                        type="checkbox"
                        checked={selectedVariantIds.has(variant.id)}
                        onChange={() => toggleVariant(variant.id)}
                        className="w-4 h-4 rounded border-input"
                      />
                      <span>{product.emoji}</span>
                      <span className="truncate">{label}</span>
                    </label>
                  ))}
                  {sellableVariants.length === 0 && (
                    <p className="p-3 text-xs text-muted-foreground italic">Aucun produit dans le catalogue.</p>
                  )}
                </div>
              </div>
              <div className="pt-2 flex gap-3">
                <Button type="button" variant="outline" onClick={closeNewModal} className="flex-1 h-11 rounded-xl font-bold">Annuler</Button>
                <Button type="submit" disabled={creating || selectedVariantIds.size === 0} className="flex-1 h-11 rounded-xl font-bold gap-2"><Save className="w-4 h-4" />Démarrer</Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  )
}
