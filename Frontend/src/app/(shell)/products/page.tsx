'use client' // Page interactive (formulaires, filtres locaux) — jamais rendue côté serveur.

import React, { useMemo, useState } from 'react' // React + hooks d'état/mémorisation.
import { Package, Plus, Search, Edit2, Trash2, X, Save, ScanBarcode, Wrench, Loader2 } from 'lucide-react' // Icônes.
import { Card } from '@/components/ui/card' // Conteneur visuel réutilisable.
import { Button } from '@/components/ui/button' // Bouton stylé réutilisable.
import { Input } from '@/components/ui/input' // Champ de saisie stylé réutilisable.
import { Badge } from '@/components/ui/badge' // Petite étiquette stylée (compteur par catégorie).
import {
  ApiProduct, STOCK_MOVEMENT_REASONS, StockMovementReason, Unit,
  getPrimaryVariant, useAdjustStock, useCategories, useCreateProduct, useDeleteProduct, useProducts, useUpdateProduct,
} from '@/lib/queries/products' // Couche de données réelle (Product -> Variant -> Stock).
import { UNIT_LABELS } from '@/lib/types' // Libellés français des unités de vente.
import BarcodeDisplayModal from '@/components/barcode-display-modal' // Affiche/imprime un code-barres.

// État local du formulaire — reste "mono-article" pour une boutique simple (épicerie) : ces
// champs alimentent en réalité UNE SEULE variante imbriquée dans le produit (voir products.ts).
const EMPTY_FORM = {
  variantId: undefined as number | undefined, // Présent en édition -> met à jour la variante existante.
  name: '', barcode: '', categoryId: '', unit: 'unite' as Unit,
  price: '', costPrice: '', stock: '', lowStockThreshold: '10', expirationDate: '', emoji: '📦',
}

const UNCATEGORIZED = { id: -1, boutique: -1, name: 'Non classé', description: '', image_url: '' }

export default function ProductsPage() {
  const { data: products = [], isLoading, isError } = useProducts()
  const { data: categories = [] } = useCategories()
  const createProduct = useCreateProduct()
  const updateProduct = useUpdateProduct()
  const deleteProduct = useDeleteProduct()
  const adjustStock = useAdjustStock()

  const [searchTerm, setSearchTerm] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editing, setEditing] = useState<ApiProduct | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [barcodeTarget, setBarcodeTarget] = useState<ApiProduct | null>(null)
  const [adjustTarget, setAdjustTarget] = useState<ApiProduct | null>(null)
  const [newQty, setNewQty] = useState('')
  const [adjustReason, setAdjustReason] = useState<StockMovementReason>('CORRECTION_MANUELLE')
  const [saving, setSaving] = useState(false)

  const filtered = useMemo(() => {
    return products.filter(p => {
      const matchesCategory = categoryFilter === 'all' || String(p.category.id) === categoryFilter
      const term = searchTerm.trim().toLowerCase()
      const barcode = getPrimaryVariant(p)?.barcode || ''
      const matchesSearch = !term || p.name.toLowerCase().includes(term) || barcode.includes(term)
      return matchesCategory && matchesSearch
    })
  }, [products, searchTerm, categoryFilter])

  // Regroupe les produits filtrés par catégorie (dans l'ordre des catégories),
  // pour un catalogue plus lisible qu'une liste unique de 20+ articles mélangés.
  const groupedByCategory = useMemo(() => {
    const groups = categories.map(c => ({
      category: c,
      items: filtered.filter(p => p.category.id === c.id),
    })).filter(g => g.items.length > 0)
    const uncategorized = filtered.filter(p => !categories.some(c => c.id === p.category.id))
    if (uncategorized.length > 0) groups.push({ category: UNCATEGORIZED, items: uncategorized })
    return groups
  }, [filtered, categories])

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setIsModalOpen(true)
  }

  const openEdit = (p: ApiProduct) => {
    const variant = getPrimaryVariant(p)
    setEditing(p)
    setForm({
      variantId: variant.id, // Capital : sans ça, la modification supprimerait puis recréerait la variante.
      name: p.name, barcode: variant.barcode, categoryId: String(p.category.id), unit: p.unit,
      price: String(variant.sellingPrice), costPrice: String(variant.costPrice),
      stock: String(variant.stock.onHandQty), lowStockThreshold: String(variant.lowStockThreshold),
      expirationDate: p.expirationDate || '', emoji: p.emoji,
    })
    setIsModalOpen(true)
  }

  const closeModal = () => {
    setIsModalOpen(false)
    setEditing(null)
    setForm(EMPTY_FORM)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const payload = {
        category: Number(form.categoryId || categories[0]?.id),
        name: form.name.trim(),
        unit: form.unit,
        expirationDate: form.expirationDate || null,
        emoji: form.emoji || '📦',
        variant: {
          id: form.variantId,
          barcode: form.barcode.trim(),
          sellingPrice: Number(form.price) || 0,
          costPrice: Number(form.costPrice) || 0,
          lowStockThreshold: Number(form.lowStockThreshold) || 0,
        },
      }
      if (editing) {
        await updateProduct.mutateAsync({ id: editing.id, input: payload })
      } else {
        const created = await createProduct.mutateAsync(payload)
        // Le stock initial n'est jamais un champ direct du produit/de la variante (voir
        // Backend/docs/schema.md) : il se pose comme un premier mouvement ENTREE, une fois
        // la variante (et donc sa ligne de Stock à zéro) créée par l'appel ci-dessus.
        const initialStock = Number(form.stock) || 0
        if (initialStock > 0) {
          await adjustStock.mutateAsync({
            stockId: getPrimaryVariant(created).stock.id,
            diff: initialStock,
            reason: 'STOCK_INITIAL',
          })
        }
      }
      closeModal()
    } finally {
      setSaving(false)
    }
  }

  const openAdjust = (p: ApiProduct) => {
    setAdjustTarget(p)
    setNewQty(String(getPrimaryVariant(p).stock.availableQty))
    setAdjustReason('CORRECTION_MANUELLE')
  }

  const closeAdjust = () => {
    setAdjustTarget(null)
    setNewQty('')
  }

  const submitAdjust = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!adjustTarget) return
    const variant = getPrimaryVariant(adjustTarget)
    const diff = (Number(newQty) || 0) - variant.stock.availableQty
    if (diff !== 0) {
      await adjustStock.mutateAsync({ stockId: variant.stock.id, diff, reason: adjustReason })
    }
    closeAdjust()
  }

  if (isLoading) {
    return <div className="p-12 text-center text-muted-foreground">Chargement du catalogue...</div>
  }
  if (isError) {
    return <div className="p-12 text-center text-destructive font-medium">Impossible de charger les produits. Vérifie que le serveur répond.</div>
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground flex items-center gap-3">
            <Package className="w-8 h-8 text-primary" />
            Produits
          </h1>
          <p className="text-muted-foreground mt-1 text-sm font-medium">Catalogue de la boutique — {products.length} article(s)</p>
        </div>
        <Button onClick={openCreate} className="rounded-xl px-6 h-12 gap-2 font-bold">
          <Plus className="w-5 h-5" />
          Nouveau Produit
        </Button>
      </div>

      <Card className="p-4 border-border/50 shadow-sm bg-card/50">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher par nom ou code-barres..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-11 h-12 rounded-xl"
            />
          </div>
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className="h-12 px-4 rounded-xl border border-border/50 bg-background text-sm font-bold"
          >
            <option value="all">Toutes les catégories</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </Card>

      <div className="space-y-8">
        {groupedByCategory.map(({ category, items }) => (
          <div key={category.id} className="space-y-3">
            <div className="flex items-center gap-2 px-1">
              <h2 className="text-sm font-black uppercase tracking-wider text-foreground">{category.name}</h2>
              <Badge variant="outline" className="text-[10px] font-bold">{items.length}</Badge>
            </div>
            <div className="overflow-hidden rounded-2xl border border-border/50 bg-card shadow-sm divide-y divide-border/40">
              {items.map(p => {
                const variant = getPrimaryVariant(p)
                return (
                  <div key={p.id} className="flex items-center gap-3 p-4 hover:bg-muted/30 transition-colors">
                    <div className="w-10 h-10 rounded-xl bg-primary/5 border border-primary/10 flex items-center justify-center text-lg shrink-0">
                      {p.emoji}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-foreground text-sm truncate">{p.name}</div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-[10px] text-muted-foreground uppercase font-bold">{UNIT_LABELS[p.unit]}</span>
                        <span className="font-mono text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{variant.barcode}</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0 hidden sm:block w-28">
                      <div className="font-bold text-sm">{variant.sellingPrice.toLocaleString()} FCFA</div>
                    </div>
                    <div className="text-center shrink-0 w-14">
                      <span className={`font-black ${
                        variant.stock.availableQty === 0 ? 'text-destructive'
                          : variant.stock.availableQty <= variant.lowStockThreshold ? 'text-orange-500'
                          : 'text-green-600'
                      }`}>
                        {variant.stock.availableQty}
                      </span>
                    </div>
                    <div className="flex items-center justify-end gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-8 w-8" title="Ajuster le stock" onClick={() => openAdjust(p)}>
                        <Wrench className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" title="Voir le code-barres à scanner" onClick={() => setBarcodeTarget(p)}>
                        <ScanBarcode className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(p)}>
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost" size="icon" className="h-8 w-8 text-destructive"
                        onClick={() => { if (confirm('Supprimer ce produit ?')) deleteProduct.mutate(p.id) }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="p-12 text-center text-muted-foreground rounded-2xl border border-dashed border-border/50">Aucun produit trouvé.</div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeModal} />
          <Card className="relative w-full max-w-lg shadow-2xl border-border/50 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-border/50 flex items-center justify-between">
              <h2 className="text-xl font-black">{editing ? 'Modifier Produit' : 'Nouveau Produit'}</h2>
              <Button variant="ghost" size="icon" onClick={closeModal} className="rounded-full">
                <X className="w-5 h-5" />
              </Button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-[64px_1fr] gap-3">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-muted-foreground uppercase">Icône</label>
                  <Input value={form.emoji} onChange={e => setForm({ ...form, emoji: e.target.value })} className="h-11 text-center text-lg" maxLength={2} />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-muted-foreground uppercase">Nom du produit</label>
                  <Input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ex: Sucre en poudre (1kg)" className="h-11" />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase">Code-barres</label>
                <Input required value={form.barcode} onChange={e => setForm({ ...form, barcode: e.target.value })} placeholder="Ex: 6151200000017" className="h-11 font-mono" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-muted-foreground uppercase">Catégorie</label>
                  <select value={form.categoryId} onChange={e => setForm({ ...form, categoryId: e.target.value })} className="w-full h-11 px-3 rounded-xl border border-input bg-background text-sm">
                    <option value="">Sélectionner...</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-muted-foreground uppercase">Unité</label>
                  <select value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value as Unit })} className="w-full h-11 px-3 rounded-xl border border-input bg-background text-sm">
                    {Object.entries(UNIT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-muted-foreground uppercase">Prix de vente (FCFA)</label>
                  <Input required type="number" min="0" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} className="h-11" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-muted-foreground uppercase">Prix d'achat (FCFA)</label>
                  <Input required type="number" min="0" value={form.costPrice} onChange={e => setForm({ ...form, costPrice: e.target.value })} className="h-11" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {!editing && (
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-muted-foreground uppercase">Stock initial</label>
                    <Input required type="number" min="0" value={form.stock} onChange={e => setForm({ ...form, stock: e.target.value })} className="h-11" />
                  </div>
                )}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-muted-foreground uppercase">Seuil alerte</label>
                  <Input required type="number" min="0" value={form.lowStockThreshold} onChange={e => setForm({ ...form, lowStockThreshold: e.target.value })} className="h-11" />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase">Date de péremption (optionnel)</label>
                <Input type="date" value={form.expirationDate} onChange={e => setForm({ ...form, expirationDate: e.target.value })} className="h-11" />
              </div>
              <div className="pt-4 flex gap-3">
                <Button type="button" variant="outline" onClick={closeModal} className="flex-1 h-11 rounded-xl font-bold">Annuler</Button>
                <Button type="submit" disabled={saving} className="flex-1 h-11 rounded-xl font-bold gap-2">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Enregistrer
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      <BarcodeDisplayModal
        product={barcodeTarget ? {
          barcode: getPrimaryVariant(barcodeTarget).barcode,
          emoji: barcodeTarget.emoji,
          name: barcodeTarget.name,
          price: getPrimaryVariant(barcodeTarget).sellingPrice,
        } : null}
        onClose={() => setBarcodeTarget(null)}
      />

      {adjustTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeAdjust} />
          <Card className="relative w-full max-w-md shadow-2xl border-border/50">
            <div className="p-6 border-b border-border/50 flex items-center justify-between">
              <h2 className="text-xl font-black">Ajuster le stock</h2>
              <Button variant="ghost" size="icon" onClick={closeAdjust} className="rounded-full"><X className="w-5 h-5" /></Button>
            </div>
            <form onSubmit={submitAdjust} className="p-6 space-y-4">
              <p className="text-sm text-muted-foreground">
                {adjustTarget.emoji} <span className="font-bold text-foreground">{adjustTarget.name}</span> — stock actuel :{' '}
                <span className="font-bold">{getPrimaryVariant(adjustTarget).stock.availableQty}</span>
              </p>
              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase">Nouveau stock réel</label>
                <Input required type="number" min="0" value={newQty} onChange={e => setNewQty(e.target.value)} className="h-11" autoFocus />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase">Raison</label>
                <select
                  value={adjustReason}
                  onChange={e => setAdjustReason(e.target.value as StockMovementReason)}
                  className="w-full h-11 px-3 rounded-xl border border-input bg-background text-sm"
                >
                  {STOCK_MOVEMENT_REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div className="pt-2 flex gap-3">
                <Button type="button" variant="outline" onClick={closeAdjust} className="flex-1 h-11 rounded-xl font-bold">Annuler</Button>
                <Button type="submit" className="flex-1 h-11 rounded-xl font-bold gap-2"><Save className="w-4 h-4" />Valider</Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  )
}
