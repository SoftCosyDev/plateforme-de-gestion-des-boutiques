'use client' // Page interactive (panier de commande, actions serveur) — jamais rendue côté serveur.

import React, { useMemo, useState } from 'react' // React + hooks d'état/mémorisation.
import { PackageCheck, Plus, Minus, Trash2, Search, X, Save, CheckCircle2, XCircle, Loader2 } from 'lucide-react' // Icônes.
import { Card } from '@/components/ui/card' // Conteneur visuel réutilisable.
import { Button } from '@/components/ui/button' // Bouton stylé réutilisable.
import { Input } from '@/components/ui/input' // Champ de saisie stylé réutilisable.
import { Badge } from '@/components/ui/badge' // Petite étiquette stylée (statut).
import { getPrimaryVariant, useProducts } from '@/lib/queries/products' // Catalogue réel (variantes).
import { useCustomers } from '@/lib/queries/customers' // Clients réels (Phase 3, pour le rattachement optionnel).
import {
  OrderPaymentMode, OrderStatus, useCreateOrder, useMarkOrderCancelled, useMarkOrderDelivered, useOrders,
} from '@/lib/queries/orders' // Commandes réelles.

// Une ligne du panier de commande — garde à la fois `productId` (toujours requis côté backend)
// et `variantId` (toujours connu ici, catalogue interne — pas une vitrine publique).
interface CartItem {
  variantId: number
  productId: number
  name: string
  emoji: string
  unitPrice: number
  quantity: number
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  EN_ATTENTE: 'En attente', EN_COURS: 'En cours', LIVRE: 'Livré', ANNULE: 'Annulé',
}
const STATUS_STYLES: Record<OrderStatus, string> = {
  EN_ATTENTE: 'bg-orange-100 text-orange-700 hover:bg-orange-100',
  EN_COURS: 'bg-blue-100 text-blue-700 hover:bg-blue-100',
  LIVRE: 'bg-green-100 text-green-700 hover:bg-green-100',
  ANNULE: 'bg-muted text-muted-foreground hover:bg-muted',
}

export default function OrdersPage() {
  const { data: products = [] } = useProducts()
  const { data: customers = [] } = useCustomers()
  const { data: orders = [], isLoading, isError } = useOrders()
  const createOrder = useCreateOrder()
  const markDelivered = useMarkOrderDelivered()
  const markCancelled = useMarkOrderCancelled()

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [paymentMode, setPaymentMode] = useState<OrderPaymentMode>('CASH_LIVRAISON')
  const [searchTerm, setSearchTerm] = useState('')
  const [cart, setCart] = useState<CartItem[]>([])
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const total = cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)

  const matchedCustomer = useMemo(() => {
    const phone = customerPhone.trim()
    return phone ? customers.find(c => c.phone === phone) || null : null
  }, [customers, customerPhone])

  const searchResults = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    if (!term) return []
    return products.filter(p => {
      const barcode = getPrimaryVariant(p)?.barcode || ''
      return p.name.toLowerCase().includes(term) || barcode.includes(term)
    }).slice(0, 6)
  }, [products, searchTerm])

  const addToCart = (product: (typeof products)[number]) => {
    const variant = getPrimaryVariant(product)
    if (!variant) return
    setCart(prev => {
      const existing = prev.find(i => i.variantId === variant.id)
      if (existing) return prev.map(i => i.variantId === variant.id ? { ...i, quantity: i.quantity + 1 } : i)
      return [...prev, {
        variantId: variant.id, productId: product.id, name: product.name, emoji: product.emoji,
        unitPrice: variant.sellingPrice, quantity: 1,
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

  const removeFromCart = (variantId: number) => setCart(prev => prev.filter(i => i.variantId !== variantId))

  const closeModal = () => {
    setIsModalOpen(false)
    setCart([])
    setCustomerName('')
    setCustomerPhone('')
    setDeliveryAddress('')
    setPaymentMode('CASH_LIVRAISON')
    setFormError(null)
  }

  const handleSubmit = async () => {
    if (cart.length === 0) return
    if (!customerName.trim() || !customerPhone.trim()) {
      setFormError('Le nom et le téléphone du client sont obligatoires pour une commande.')
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      await createOrder.mutateAsync({
        customer: matchedCustomer?.id ?? null,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        deliveryAddress: deliveryAddress.trim(),
        paymentMode,
        lines: cart.map(i => ({ product: i.productId, variant: i.variantId, quantity: i.quantity, unitPrice: i.unitPrice })),
      })
      closeModal()
    } catch (err: any) {
      setFormError(err?.response?.data?.detail || "Impossible d'enregistrer cette commande.")
    } finally {
      setSaving(false)
    }
  }

  const handleDeliver = async (id: number) => {
    setActionError(null)
    try {
      await markDelivered.mutateAsync(id)
    } catch (err: any) {
      setActionError(err?.response?.data?.detail || 'Livraison impossible.')
    }
  }

  const handleCancel = async (id: number) => {
    setActionError(null)
    try {
      await markCancelled.mutateAsync(id)
    } catch (err: any) {
      setActionError(err?.response?.data?.detail || 'Annulation impossible.')
    }
  }

  if (isLoading) {
    return <div className="p-12 text-center text-muted-foreground">Chargement des commandes...</div>
  }
  if (isError) {
    return <div className="p-12 text-center text-destructive font-medium">Impossible de charger les commandes. Vérifie que le serveur répond.</div>
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground flex items-center gap-3">
            <PackageCheck className="w-8 h-8 text-primary" />
            Commandes
          </h1>
          <p className="text-muted-foreground mt-1 text-sm font-medium">{orders.length} commande(s) à livrer</p>
        </div>
        <Button onClick={() => setIsModalOpen(true)} className="rounded-xl px-6 h-12 gap-2 font-bold">
          <Plus className="w-5 h-5" />
          Nouvelle Commande
        </Button>
      </div>

      {actionError && (
        <p className="text-xs font-bold text-destructive bg-destructive/10 rounded-lg p-2.5">{actionError}</p>
      )}

      <div className="overflow-hidden rounded-2xl border border-border/50 bg-card shadow-sm divide-y divide-border/40">
        {orders.map(o => (
          <div key={o.id} className="flex items-center gap-3 p-4 hover:bg-muted/30 transition-colors">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-foreground text-sm">Commande #{o.id}</span>
                <Badge className={`text-[9px] uppercase font-black ${STATUS_STYLES[o.status]}`}>{STATUS_LABELS[o.status]}</Badge>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {o.customerName} ({o.customerPhone}) — {o.lines.length} article(s)
              </div>
            </div>
            <div className="text-right shrink-0 w-32">
              <div className="font-bold text-sm">{o.total.toLocaleString()} FCFA</div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {o.status !== 'LIVRE' && o.status !== 'ANNULE' && (
                <>
                  <Button
                    size="sm" variant="outline" className="h-9 text-xs font-bold gap-1.5"
                    disabled={markDelivered.isPending} onClick={() => handleDeliver(o.id)}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" /> Livrer
                  </Button>
                  <Button
                    size="sm" variant="outline" className="h-9 text-xs font-bold gap-1.5 text-destructive"
                    disabled={markCancelled.isPending} onClick={() => handleCancel(o.id)}
                  >
                    <XCircle className="w-3.5 h-3.5" /> Annuler
                  </Button>
                </>
              )}
            </div>
          </div>
        ))}
        {orders.length === 0 && (
          <div className="p-16 text-center text-muted-foreground">Aucune commande pour le moment.</div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeModal} />
          <Card className="relative w-full max-w-lg shadow-2xl border-border/50 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-border/50 flex items-center justify-between">
              <h2 className="text-xl font-black">Nouvelle Commande</h2>
              <Button variant="ghost" size="icon" onClick={closeModal} className="rounded-full"><X className="w-5 h-5" /></Button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-muted-foreground uppercase">Nom du client</label>
                  <Input required value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Ex: Mme Akossiwa" className="h-11" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-muted-foreground uppercase">Téléphone</label>
                  <Input required type="tel" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="+228 90 00 00 00" className="h-11" />
                </div>
              </div>
              {matchedCustomer && (
                <Badge variant="outline" className="text-[10px]">Client existant — rattaché automatiquement</Badge>
              )}
              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase">Adresse de livraison (optionnel)</label>
                <Input value={deliveryAddress} onChange={e => setDeliveryAddress(e.target.value)} placeholder="Ex: Quartier, rue, repère" className="h-11" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase">Paiement</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['CASH_LIVRAISON', 'MOBILE_MONEY'] as OrderPaymentMode[]).map(mode => (
                    <button
                      key={mode} type="button" onClick={() => setPaymentMode(mode)}
                      className={`h-10 rounded-xl text-xs font-bold border transition-all ${
                        paymentMode === mode ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      {mode === 'CASH_LIVRAISON' ? 'Paiement à la livraison' : 'Mobile Money'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Rechercher un produit à ajouter..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="pl-11 h-11 rounded-xl"
                />
                {searchResults.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full divide-y divide-border/40 border border-border/50 rounded-xl overflow-hidden bg-card shadow-lg">
                    {searchResults.map(p => {
                      const variant = getPrimaryVariant(p)
                      return (
                        <button
                          key={p.id} type="button" onClick={() => addToCart(p)}
                          className="w-full flex items-center justify-between gap-2 p-3 text-left text-sm hover:bg-muted transition-colors"
                        >
                          <span className="flex items-center gap-2 truncate"><span>{p.emoji}</span><span className="font-semibold truncate">{p.name}</span></span>
                          <span className="text-xs font-bold text-muted-foreground shrink-0">{variant.sellingPrice.toLocaleString()} FCFA</span>
                        </button>
                      )
                    })}
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
                      <p className="text-xs text-muted-foreground">{item.unitPrice.toLocaleString()} FCFA</p>
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
                  Enregistrer la commande
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
