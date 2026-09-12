'use client' // Page interactive (panier, scan, formulaire) — jamais rendue côté serveur.

import React, { useMemo, useState } from 'react' // React + hooks d'état/mémorisation.
import { ScanLine, Search, Plus, Minus, Trash2, ShoppingCart, User, Loader2, ChevronLeft } from 'lucide-react' // Icônes.
import { Card } from '@/components/ui/card' // Conteneur visuel réutilisable.
import { Button } from '@/components/ui/button' // Bouton stylé réutilisable.
import { Input } from '@/components/ui/input' // Champ de saisie stylé réutilisable.
import { Badge } from '@/components/ui/badge' // Petite étiquette stylée.
import { ApiProduct, ApiVariant, findVariantByBarcode, flattenSellableVariants, searchSellableVariants, useProducts, useCategories, variantLabel } from '@/lib/queries/products' // Catalogue réel.
import { useCustomers, useCreateCustomer } from '@/lib/queries/customers' // Clients réels (Phase 3).
import { PaymentMode, useCreateSale } from '@/lib/queries/sales' // Encaissement réel.
import BarcodeScannerModal from '@/components/barcode-scanner-modal' // Scan caméra, backend-agnostic.

// Une ligne du panier — référence toujours une VARIANTE (jamais un produit directement),
// puisque c'est elle que la vente enregistre côté serveur (voir queries/sales.ts).
interface CartItem {
  variantId: number
  productId: number
  name: string
  emoji: string
  unitPrice: number
  quantity: number
  maxStock: number
}

export default function CashierPage() {
  const { data: products = [] } = useProducts()
  const { data: categories = [] } = useCategories()
  const { data: customers = [] } = useCustomers()
  const createCustomer = useCreateCustomer()
  const createSale = useCreateSale()

  const [cart, setCart] = useState<CartItem[]>([])
  const [isScannerOpen, setIsScannerOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [scanFeedback, setScanFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [activeCategory, setActiveCategory] = useState<number | null>(null)

  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('cash')
  const [momoRef, setMomoRef] = useState('')
  const [momoSender, setMomoSender] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const total = cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)

  // Un client existant est reconnu par son numéro (identifiant le plus fiable) —
  // permet d'afficher son ardoise actuelle et de créditer le bon compte sans dropdown.
  const matchedCustomer = useMemo(() => {
    const phone = customerPhone.trim()
    return phone ? customers.find(c => c.phone === phone) || null : null
  }, [customers, customerPhone])

  // Recherche à l'échelle de LA variante (pas seulement la première) — indispensable dès qu'un
  // produit a plusieurs déclinaisons, chacune avec son propre code-barres/prix/stock.
  const searchResults = useMemo(() => searchSellableVariants(products, searchTerm), [products, searchTerm])

  const categoriesWithCount = useMemo(() => (
    categories.map(c => ({ ...c, count: products.filter(p => p.category.id === c.id).length })).filter(c => c.count > 0)
  ), [categories, products])

  const categoryVariants = useMemo(() => (
    activeCategory !== null ? flattenSellableVariants(products.filter(p => p.category.id === activeCategory)) : []
  ), [products, activeCategory])

  const addToCart = (product: ApiProduct, variant: ApiVariant, quantity = 1) => {
    if (!variant || variant.stock.availableQty <= 0) return
    setCart(prev => {
      const existing = prev.find(i => i.variantId === variant.id)
      if (existing) {
        if (existing.quantity >= variant.stock.availableQty) return prev
        return prev.map(i => i.variantId === variant.id
          ? { ...i, quantity: Math.min(i.quantity + quantity, variant.stock.availableQty) }
          : i)
      }
      return [...prev, {
        variantId: variant.id, productId: product.id, name: variantLabel(product, variant), emoji: product.emoji,
        unitPrice: variant.sellingPrice, quantity: 1, maxStock: variant.stock.availableQty,
      }]
    })
  }

  const handleScan = (barcode: string) => {
    const match = findVariantByBarcode(products, barcode)
    if (!match) {
      setScanFeedback({ type: 'error', message: `Produit inconnu : ${barcode}` })
      return
    }
    const { product, variant, label } = match
    if (variant.stock.availableQty <= 0) {
      setScanFeedback({ type: 'error', message: `${product.name} — rupture de stock` })
      return
    }
    addToCart(product, variant)
    setScanFeedback({ type: 'success', message: `${product.emoji} ${label} ajouté` })
  }

  const updateQty = (variantId: number, delta: number) => {
    setCart(prev => prev
      .map(i => i.variantId === variantId ? { ...i, quantity: Math.max(0, Math.min(i.maxStock, i.quantity + delta)) } : i)
      .filter(i => i.quantity > 0)
    )
  }

  const removeFromCart = (variantId: number) => setCart(prev => prev.filter(i => i.variantId !== variantId))

  const resetSale = () => {
    setCart([])
    setCustomerName('')
    setCustomerPhone('')
    setPaymentMode('cash')
    setMomoRef('')
    setMomoSender('')
    setFormError(null)
    setActiveCategory(null)
  }

  const handleValidate = async () => {
    if (cart.length === 0) return

    const trimmedName = customerName.trim()
    const trimmedPhone = customerPhone.trim()

    if (paymentMode === 'credit' && (!trimmedName || !trimmedPhone)) {
      setFormError('Le nom et le numéro de téléphone du client sont obligatoires pour une vente à crédit (ardoise).')
      return
    }
    if (paymentMode === 'mobile_money' && (!momoRef.trim() || !momoSender.trim())) {
      setFormError("La référence et le numéro d'envoi Mobile Money sont obligatoires.")
      return
    }
    setFormError(null)
    setIsSubmitting(true)

    try {
      // Rattache la vente à un client existant si son numéro correspond déjà, sinon crée un
      // nouveau client à la volée dès qu'un numéro est fourni — sans quoi la vente reste
      // anonyme (le backend n'accepte un nom de client QUE via une fiche client réelle).
      let resolvedCustomerId: number | null = null
      if (trimmedPhone) {
        const existing = customers.find(c => c.phone === trimmedPhone)
        if (existing) {
          resolvedCustomerId = existing.id
        } else {
          const created = await createCustomer.mutateAsync({ name: trimmedName || 'Client', phone: trimmedPhone })
          resolvedCustomerId = created.id
        }
      }

      const sale = await createSale.mutateAsync({
        customer: resolvedCustomerId,
        paymentMode,
        mobileMoneyReference: paymentMode === 'mobile_money' ? momoRef.trim() : undefined,
        mobileMoneySender: paymentMode === 'mobile_money' ? momoSender.trim() : undefined,
        lines: cart.map(i => ({ variant: i.variantId, quantity: i.quantity, unitPrice: i.unitPrice })),
      })
      setSuccessMessage(`Vente #${sale.invoiceNumber ?? sale.id} enregistrée avec succès !`)
      resetSale()
    } catch (err: any) {
      setFormError(err?.response?.data?.detail || "Impossible d'enregistrer la vente. Vérifie les informations saisies.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6 h-full">
      {/* Colonne recherche / scan */}
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground flex items-center gap-3">
            <ShoppingCart className="w-8 h-8 text-primary" />
            Caisse
          </h1>
          <p className="text-muted-foreground mt-1 text-sm font-medium">Scanne ou recherche un produit pour l'ajouter au panier</p>
        </div>

        {successMessage && (
          <div className="p-3 rounded-xl text-sm font-bold text-center bg-primary/10 text-primary">
            {successMessage}
          </div>
        )}

        <Button
          onClick={() => setIsScannerOpen(true)}
          className="w-full h-16 rounded-2xl text-lg font-black gap-3 shadow-lg shadow-primary/25"
        >
          <ScanLine className="w-7 h-7" />
          Scanner un produit
        </Button>

        {scanFeedback && (
          <div className={`p-3 rounded-xl text-sm font-bold text-center ${
            scanFeedback.type === 'success' ? 'bg-primary/10 text-primary' : 'bg-destructive/10 text-destructive'
          }`}>
            {scanFeedback.message}
          </div>
        )}

        <Card className="p-4 border-border/50 shadow-sm bg-card/50">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Ou rechercher par nom / code-barres..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-11 h-12 rounded-xl"
            />
          </div>
          {searchResults.length > 0 && (
            <div className="mt-3 divide-y divide-border/40 border border-border/50 rounded-xl overflow-hidden">
              {searchResults.map(({ product, variant, label }) => (
                <button
                  key={variant.id}
                  type="button"
                  disabled={variant.stock.availableQty <= 0}
                  onClick={() => { addToCart(product, variant); setSearchTerm('') }}
                  className="w-full flex items-center justify-between gap-2 p-3 text-left text-sm hover:bg-muted transition-colors disabled:opacity-40"
                >
                  <span className="flex items-center gap-2 truncate"><span>{product.emoji}</span><span className="font-semibold truncate">{label}</span></span>
                  <span className="text-xs font-bold text-muted-foreground shrink-0">{variant.sellingPrice.toLocaleString()} FCFA · Stock {variant.stock.availableQty}</span>
                </button>
              ))}
            </div>
          )}
        </Card>

        {/* Catégories / produits rapides */}
        {activeCategory === null ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {categoriesWithCount.map(cat => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(cat.id)}
                className="p-4 rounded-2xl border border-border/50 bg-card hover:border-primary/40 hover:shadow-md transition-all text-left"
              >
                <div className="text-sm font-bold truncate">{cat.name}</div>
                <div className="text-[12px] text-muted-foreground mt-1">{cat.count} article(s)</div>
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setActiveCategory(null)}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronLeft className="w-4 h-4" /> Catégories
              </button>
              <span className="text-sm font-black">{categoriesWithCount.find(c => c.id === activeCategory)?.name}</span>
            </div>
            <div className="overflow-hidden rounded-2xl border border-border/50 bg-card shadow-sm divide-y divide-border/40">
              {categoryVariants.map(({ product, variant, label }) => (
                <button
                  key={variant.id}
                  type="button"
                  disabled={variant.stock.availableQty <= 0}
                  onClick={() => addToCart(product, variant)}
                  className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <span className="text-xl shrink-0">{product.emoji}</span>
                  <span className="flex-1 min-w-0 font-semibold text-sm truncate">{label}</span>
                  <span className="text-xs font-bold text-muted-foreground shrink-0">{variant.sellingPrice.toLocaleString()} FCFA</span>
                  <span className={`text-[12px] font-black shrink-0 ${
                    variant.stock.availableQty === 0 ? 'text-destructive' : variant.stock.availableQty <= variant.lowStockThreshold ? 'text-orange-500' : 'text-green-600'
                  }`}>
                    Stock {variant.stock.availableQty}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Colonne panier */}
      <Card className="flex flex-col border-border/50 shadow-xl h-fit lg:sticky lg:top-6">
        <div className="p-5 border-b border-border/50">
          <h2 className="font-black text-lg">Panier</h2>
        </div>

        <div className="flex-1 overflow-y-auto max-h-[320px] divide-y divide-border/40">
          {cart.length === 0 ? (
            <div className="p-10 text-center text-muted-foreground text-sm">Panier vide</div>
          ) : cart.map(item => (
            <div key={item.variantId} className="flex items-center gap-2 p-3">
              <span className="text-xl shrink-0">{item.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{item.name}</p>
                <p className="text-xs text-muted-foreground">{item.unitPrice.toLocaleString()} FCFA</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => updateQty(item.variantId, -1)}><Minus className="w-3 h-3" /></Button>
                <span className="w-6 text-center font-bold text-sm">{item.quantity}</span>
                <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => updateQty(item.variantId, 1)} disabled={item.quantity >= item.maxStock}><Plus className="w-3 h-3" /></Button>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive shrink-0" onClick={() => removeFromCart(item.variantId)}><Trash2 className="w-3 h-3" /></Button>
            </div>
          ))}
        </div>

        <div className="p-5 border-t border-border/50 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-muted-foreground uppercase">Total</span>
            <span className="text-2xl font-black text-primary">{total.toLocaleString()} FCFA</span>
          </div>

          {/* Client */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1">
              <User className="w-3 h-3" /> Nom du client
              {paymentMode === 'credit' && <span className="text-destructive normal-case">(obligatoire)</span>}
            </label>
            <Input
              list="customer-names"
              placeholder="Ex: Mme Akossiwa — laisser vide si anonyme"
              value={customerName}
              onChange={e => {
                const val = e.target.value
                setCustomerName(val)
                const match = customers.find(c => c.name === val)
                if (match) setCustomerPhone(match.phone)
              }}
              className="h-10 text-sm"
            />
            <datalist id="customer-names">
              {customers.map(c => <option key={c.id} value={c.name} />)}
            </datalist>

            <label className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1 pt-1">
              Numéro de téléphone
              {paymentMode === 'credit' && <span className="text-destructive normal-case">(obligatoire)</span>}
            </label>
            <Input
              type="tel"
              placeholder="+228 90 00 00 00"
              value={customerPhone}
              onChange={e => setCustomerPhone(e.target.value)}
              className="h-10 text-sm"
            />
            {matchedCustomer && (
              <Badge variant="outline" className="text-[12px]">
                Client existant — doit déjà {matchedCustomer.balanceDue.toLocaleString()} FCFA
              </Badge>
            )}
          </div>

          {/* Paiement */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-muted-foreground uppercase">Paiement</label>
            <div className="grid grid-cols-3 gap-2">
              {(['cash', 'mobile_money', 'credit'] as PaymentMode[]).map(mode => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setPaymentMode(mode)}
                  className={`h-10 rounded-xl text-xs font-bold border transition-all ${
                    paymentMode === mode ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {mode === 'cash' ? 'Cash' : mode === 'mobile_money' ? 'Mobile Money' : 'Crédit'}
                </button>
              ))}
            </div>
            {paymentMode === 'credit' && (
              <Badge variant="outline" className="text-[12px]">Le montant sera ajouté à l'ardoise du client</Badge>
            )}
            {paymentMode === 'mobile_money' && (
              <div className="space-y-2 pt-1">
                <Input
                  placeholder="Référence de la transaction"
                  value={momoRef}
                  onChange={e => setMomoRef(e.target.value)}
                  className="h-10 text-sm"
                />
                <Input
                  type="tel"
                  placeholder="Numéro d'envoi (celui qui a payé)"
                  value={momoSender}
                  onChange={e => setMomoSender(e.target.value)}
                  className="h-10 text-sm"
                />
              </div>
            )}
          </div>

          {formError && (
            <p className="text-xs font-bold text-destructive bg-destructive/10 rounded-lg p-2.5">{formError}</p>
          )}

          <Button
            onClick={handleValidate}
            disabled={cart.length === 0 || isSubmitting}
            className="w-full h-12 rounded-xl font-bold gap-2"
          >
            {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Valider la vente'}
          </Button>
        </div>
      </Card>

      <BarcodeScannerModal isOpen={isScannerOpen} onClose={() => setIsScannerOpen(false)} onScan={handleScan} />
    </div>
  )
}
