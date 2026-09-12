'use client' // Page interactive (panier d'achat, actions serveur) — jamais rendue côté serveur.

import React, { useMemo, useState } from 'react' // React + hooks d'état/mémorisation.
import { PackagePlus, Plus, Minus, Trash2, Search, X, Save, CheckCircle2, Loader2 } from 'lucide-react' // Icônes.
import { Card } from '@/components/ui/card' // Conteneur visuel réutilisable.
import { Button } from '@/components/ui/button' // Bouton stylé réutilisable.
import { Input } from '@/components/ui/input' // Champ de saisie stylé réutilisable.
import { Badge } from '@/components/ui/badge' // Petite étiquette stylée (statut).
import { ApiProduct, ApiVariant, searchSellableVariants, useProducts, variantLabel } from '@/lib/queries/products' // Catalogue réel (variantes).
import { useSuppliers } from '@/lib/queries/suppliers' // Fournisseurs réels (Phase 5).
import { useCreatePurchase, useMarkPurchaseReceived, usePurchases } from '@/lib/queries/purchases' // Achats réels.

// Une ligne du panier d'achat — référence toujours une VARIANTE (jamais un produit
// directement), puisque c'est elle que l'achat enregistre côté serveur.
interface CartItem {
  variantId: number
  productId: number
  name: string
  emoji: string
  unitCost: number
  quantity: number
}

export default function PurchasesPage() {
  const { data: products = [] } = useProducts()
  const { data: suppliers = [] } = useSuppliers()
  const { data: purchases = [], isLoading, isError } = usePurchases()
  const createPurchase = useCreatePurchase()
  const markReceived = useMarkPurchaseReceived()

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [supplierId, setSupplierId] = useState<number | ''>('')
  const [searchTerm, setSearchTerm] = useState('')
  const [cart, setCart] = useState<CartItem[]>([])
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const total = cart.reduce((sum, item) => sum + item.unitCost * item.quantity, 0)

  // Recherche à l'échelle de LA variante (pas seulement la première) — indispensable dès qu'un
  // produit a plusieurs déclinaisons, chacune avec son propre code-barres/coût.
  const searchResults = useMemo(() => searchSellableVariants(products, searchTerm), [products, searchTerm])

  const supplierName = (id: number | null) => suppliers.find(s => s.id === id)?.name || 'Sans fournisseur'

  const addToCart = (product: ApiProduct, variant: ApiVariant) => {
    if (!variant) return
    setCart(prev => {
      const existing = prev.find(i => i.variantId === variant.id)
      if (existing) return prev.map(i => i.variantId === variant.id ? { ...i, quantity: i.quantity + 1 } : i)
      return [...prev, {
        variantId: variant.id, productId: product.id, name: variantLabel(product, variant), emoji: product.emoji,
        // Prix d'achat catalogue comme point de départ — modifiable ligne par ligne ensuite.
        unitCost: variant.costPrice, quantity: 1,
      }]
    })
    setSearchTerm('')
  }

  const updateQty = (variantId: number, delta: number) => {
    setCart(prev => prev
      .map(i => i.variantId === variantId ? { ...i, quantity: Math.max(0, i.quantity + delta) } : i)
      .filter(i => i.quantity > 0)
    )
  }

  const updateCost = (variantId: number, unitCost: number) => {
    setCart(prev => prev.map(i => i.variantId === variantId ? { ...i, unitCost } : i))
  }

  const removeFromCart = (variantId: number) => setCart(prev => prev.filter(i => i.variantId !== variantId))

  const closeModal = () => {
    setIsModalOpen(false)
    setCart([])
    setSupplierId('')
    setSearchTerm('')
    setFormError(null)
  }

  const handleSubmit = async () => {
    if (cart.length === 0) return
    setSaving(true)
    setFormError(null)
    try {
      await createPurchase.mutateAsync({
        supplier: supplierId || null,
        lines: cart.map(i => ({ variant: i.variantId, quantity: i.quantity, unitCost: i.unitCost })),
      })
      closeModal()
    } catch (err: any) {
      setFormError(err?.response?.data?.detail || "Impossible d'enregistrer cet achat.")
    } finally {
      setSaving(false)
    }
  }

  if (isLoading) {
    return <div className="p-12 text-center text-muted-foreground">Chargement des achats...</div>
  }
  if (isError) {
    return <div className="p-12 text-center text-destructive font-medium">Impossible de charger les achats. Vérifie que le serveur répond.</div>
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground flex items-center gap-3">
            <PackagePlus className="w-8 h-8 text-primary" />
            Achats
          </h1>
          <p className="text-muted-foreground mt-1 text-sm font-medium">{purchases.length} commande(s) fournisseur</p>
        </div>
        <Button onClick={() => setIsModalOpen(true)} className="rounded-xl px-6 h-12 gap-2 font-bold">
          <Plus className="w-5 h-5" />
          Nouvel Achat
        </Button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border/50 bg-card shadow-sm divide-y divide-border/40">
        {purchases.map(p => (
          <div key={p.id} className="flex items-center gap-3 p-4 hover:bg-muted/30 transition-colors">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-foreground text-sm">{p.reference}</span>
                <Badge className={`text-[11px] uppercase font-black ${p.status === 'RECU' ? 'bg-green-100 text-green-700 hover:bg-green-100' : 'bg-orange-100 text-orange-700 hover:bg-orange-100'}`}>
                  {p.status === 'RECU' ? 'Reçu' : p.status || 'En attente'}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {supplierName(p.supplier)} — {p.lines.length} article(s)
              </div>
            </div>
            <div className="text-right shrink-0 w-32">
              <div className="font-bold text-sm">{p.total.toLocaleString()} FCFA</div>
            </div>
            <div className="shrink-0">
              {p.status !== 'RECU' && (
                <Button
                  size="sm" variant="outline" className="h-9 text-xs font-bold gap-1.5"
                  disabled={markReceived.isPending}
                  onClick={() => markReceived.mutate(p.id)}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> Marquer reçu
                </Button>
              )}
            </div>
          </div>
        ))}
        {purchases.length === 0 && (
          <div className="p-16 text-center text-muted-foreground">Aucun achat pour le moment.</div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeModal} />
          <Card className="relative w-full max-w-lg shadow-2xl border-border/50 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-border/50 flex items-center justify-between">
              <h2 className="text-xl font-black">Nouvel Achat</h2>
              <Button variant="ghost" size="icon" onClick={closeModal} className="rounded-full"><X className="w-5 h-5" /></Button>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase">Fournisseur</label>
                <select
                  value={supplierId}
                  onChange={e => setSupplierId(e.target.value ? Number(e.target.value) : '')}
                  className="w-full h-11 px-3 rounded-xl border border-input bg-background text-sm"
                >
                  <option value="">Sans fournisseur précisé</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Rechercher un produit à commander..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="pl-11 h-11 rounded-xl"
                />
                {searchResults.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full divide-y divide-border/40 border border-border/50 rounded-xl overflow-hidden bg-card shadow-lg">
                    {searchResults.map(({ product, variant, label }) => (
                      <button
                        key={variant.id} type="button" onClick={() => addToCart(product, variant)}
                        className="w-full flex items-center justify-between gap-2 p-3 text-left text-sm hover:bg-muted transition-colors"
                      >
                        <span className="flex items-center gap-2 truncate"><span>{product.emoji}</span><span className="font-semibold truncate">{label}</span></span>
                        <span className="text-xs font-bold text-muted-foreground shrink-0">Coût {variant.costPrice.toLocaleString()} FCFA</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="border border-border/50 rounded-2xl overflow-hidden divide-y divide-border/40">
                {cart.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground text-sm">Aucun article ajouté</div>
                ) : cart.map(item => (
                  <div key={item.variantId} className="flex items-center gap-2 p-3">
                    <span className="text-xl shrink-0">{item.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{item.name}</p>
                      <div className="flex items-center gap-1 mt-1">
                        <span className="text-[12px] text-muted-foreground uppercase font-bold">Coût unit.</span>
                        <Input
                          type="number" min="0" value={item.unitCost}
                          onChange={e => updateCost(item.variantId, Number(e.target.value) || 0)}
                          className="h-7 w-24 text-xs"
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => updateQty(item.variantId, -1)}><Minus className="w-3 h-3" /></Button>
                      <span className="w-6 text-center font-bold text-sm">{item.quantity}</span>
                      <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => updateQty(item.variantId, 1)}><Plus className="w-3 h-3" /></Button>
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive shrink-0" onClick={() => removeFromCart(item.variantId)}><Trash2 className="w-3 h-3" /></Button>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-border/40">
                <span className="text-sm font-bold text-muted-foreground uppercase">Total</span>
                <span className="text-xl font-black text-primary">{total.toLocaleString()} FCFA</span>
              </div>

              {formError && (
                <p className="text-xs font-bold text-destructive bg-destructive/10 rounded-lg p-2.5">{formError}</p>
              )}

              <div className="pt-2 flex gap-3">
                <Button type="button" variant="outline" onClick={closeModal} className="flex-1 h-11 rounded-xl font-bold">Annuler</Button>
                <Button onClick={handleSubmit} disabled={cart.length === 0 || saving} className="flex-1 h-11 rounded-xl font-bold gap-2">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Enregistrer l'achat
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
