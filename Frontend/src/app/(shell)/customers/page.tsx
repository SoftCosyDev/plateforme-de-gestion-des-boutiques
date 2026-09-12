'use client'

import React, { useMemo, useState } from 'react'
import { Users, Plus, Search, Wallet, X, Save, History } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ApiCustomer, useCreateCustomer, useCustomerPayments, useCustomers, useRecordPayment } from '@/lib/queries/customers'

export default function CustomersPage() {
  const { data: customers = [], isLoading, isError } = useCustomers()
  const createCustomer = useCreateCustomer()
  const recordPayment = useRecordPayment()
  const [searchTerm, setSearchTerm] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [payTarget, setPayTarget] = useState<ApiCustomer | null>(null)
  const [payAmount, setPayAmount] = useState('')
  // Traçabilité : historique des règlements d'UN client, affiché à la demande (voir
  // CustomerPayment côté backend — qui a encaissé quoi, quand, jamais un simple champ modifiable).
  const [historyTarget, setHistoryTarget] = useState<ApiCustomer | null>(null)
  const { data: payments = [], isLoading: paymentsLoading } = useCustomerPayments(historyTarget?.id ?? null)
  const [statusFilter, setStatusFilter] = useState<'due' | 'clear'>('due')
  const [payError, setPayError] = useState('')

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    if (!term) return customers
    return customers.filter(c => c.name.toLowerCase().includes(term) || c.phone.includes(term))
  }, [customers, searchTerm])

  const totalDue = customers.reduce((sum, c) => sum + c.balanceDue, 0)

  // Onglet plutôt que sections empilées : avec beaucoup de clients dans un
  // groupe, défiler jusqu'à l'autre groupe deviendrait vite pénible.
  const withDebt = useMemo(() => filtered.filter(c => c.balanceDue > 0).sort((a, b) => b.balanceDue - a.balanceDue), [filtered])
  const noDebt = useMemo(() => filtered.filter(c => c.balanceDue === 0), [filtered])
  const visibleCustomers = statusFilter === 'due' ? withDebt : noDebt

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !phone.trim()) return
    await createCustomer.mutateAsync({ name: name.trim(), phone: phone.trim() })
    setName('')
    setPhone('')
    setIsModalOpen(false)
  }

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!payTarget) return
    setPayError('')
    const amount = Number(payAmount) || 0
    if (amount <= 0) return
    try {
      // Envoie le MONTANT reçu — le serveur calcule/écrit le nouveau solde lui-même et pose la
      // ligne d'historique (voir useRecordPayment), jamais calculé/imposé depuis le client.
      await recordPayment.mutateAsync({ id: payTarget.id, amount })
      setPayTarget(null)
      setPayAmount('')
    } catch (err: any) {
      setPayError(err?.response?.data?.amount?.[0] || 'Impossible d\'encaisser ce paiement.')
    }
  }

  if (isLoading) {
    return <div className="p-12 text-center text-muted-foreground">Chargement des clients...</div>
  }
  if (isError) {
    return <div className="p-12 text-center text-destructive font-medium">Impossible de charger les clients. Vérifie que le serveur répond.</div>
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground flex items-center gap-3">
            <Users className="w-8 h-8 text-primary" />
            Clients
          </h1>
          <p className="text-muted-foreground mt-1 text-sm font-medium">
            {customers.length} client(s) — {totalDue.toLocaleString()} FCFA d'ardoise au total
          </p>
        </div>
        <Button onClick={() => setIsModalOpen(true)} className="rounded-xl px-6 h-12 gap-2 font-bold">
          <Plus className="w-5 h-5" />
          Nouveau Client
        </Button>
      </div>

      <Card className="p-4 border-border/50 shadow-sm bg-card/50">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Rechercher par nom ou téléphone..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-11 h-12 rounded-xl" />
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 max-w-md">
        <button
          type="button"
          onClick={() => setStatusFilter('due')}
          className={`h-12 rounded-xl text-sm font-bold border transition-all flex items-center justify-center gap-2 ${
            statusFilter === 'due' ? 'border-destructive bg-destructive/10 text-destructive' : 'border-border text-muted-foreground hover:bg-muted'
          }`}
        >
          Avec ardoise <Badge variant="outline" className="text-[12px]">{withDebt.length}</Badge>
        </button>
        <button
          type="button"
          onClick={() => setStatusFilter('clear')}
          className={`h-12 rounded-xl text-sm font-bold border transition-all flex items-center justify-center gap-2 ${
            statusFilter === 'clear' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'
          }`}
        >
          Sans ardoise <Badge variant="outline" className="text-[12px]">{noDebt.length}</Badge>
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border/50 bg-card shadow-sm divide-y divide-border/40">
        {visibleCustomers.map(c => (
          <div key={c.id} className="flex items-center gap-3 p-4 hover:bg-muted/30 transition-colors">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-foreground text-sm truncate">{c.name}</div>
              <div className="text-xs text-muted-foreground font-mono">{c.phone}</div>
            </div>
            <div className="text-right shrink-0">
              <p className="text-[12px] text-muted-foreground uppercase font-bold">Ardoise (dû)</p>
              <p className={`font-black ${c.balanceDue > 0 ? 'text-destructive' : 'text-green-600'}`}>
                {c.balanceDue.toLocaleString()} FCFA
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 shrink-0">
              {/* Historique visible pour TOUS les clients, pas seulement ceux qui ont encore une
                  ardoise en cours — un client déjà "à jour" peut très bien avoir un historique. */}
              <Button size="icon" variant="ghost" className="h-9 w-9" title="Historique des paiements" onClick={() => setHistoryTarget(c)}>
                <History className="w-4 h-4" />
              </Button>
              {c.balanceDue > 0 && (
                <Button size="sm" variant="outline" className="h-9 text-xs font-bold gap-1.5" onClick={() => { setPayError(''); setPayTarget(c) }}>
                  <Wallet className="w-3.5 h-3.5" /> Encaisser
                </Button>
              )}
            </div>
          </div>
        ))}
        {visibleCustomers.length === 0 && (
          <div className="p-16 text-center text-muted-foreground">Aucun client dans cette liste.</div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setIsModalOpen(false)} />
          <Card className="relative w-full max-w-md shadow-2xl border-border/50">
            <div className="p-6 border-b border-border/50 flex items-center justify-between">
              <h2 className="text-xl font-black">Nouveau Client</h2>
              <Button variant="ghost" size="icon" onClick={() => setIsModalOpen(false)} className="rounded-full"><X className="w-5 h-5" /></Button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase">Nom</label>
                <Input required value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Mme Akossiwa" className="h-11" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase">Téléphone</label>
                <Input required value={phone} onChange={e => setPhone(e.target.value)} placeholder="+228 90 00 00 00" className="h-11" />
              </div>
              <div className="pt-2 flex gap-3">
                <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)} className="flex-1 h-11 rounded-xl font-bold">Annuler</Button>
                <Button type="submit" className="flex-1 h-11 rounded-xl font-bold gap-2"><Save className="w-4 h-4" />Enregistrer</Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {payTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setPayTarget(null)} />
          <Card className="relative w-full max-w-sm shadow-2xl border-border/50">
            <div className="p-6 border-b border-border/50 flex items-center justify-between">
              <h2 className="text-xl font-black">Encaisser un paiement</h2>
              <Button variant="ghost" size="icon" onClick={() => setPayTarget(null)} className="rounded-full"><X className="w-5 h-5" /></Button>
            </div>
            <form onSubmit={handlePay} className="p-6 space-y-4">
              <p className="text-sm text-muted-foreground">
                <span className="font-bold text-foreground">{payTarget.name}</span> doit actuellement{' '}
                <Badge variant="outline" className="font-black">{payTarget.balanceDue.toLocaleString()} FCFA</Badge>
              </p>
              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase">Montant reçu</label>
                <Input required type="number" min="1" max={payTarget.balanceDue} value={payAmount} onChange={e => setPayAmount(e.target.value)} className="h-11" autoFocus />
              </div>
              {payError && <p className="text-xs font-bold text-destructive bg-destructive/10 rounded-lg p-2.5">{payError}</p>}
              <div className="pt-2 flex gap-3">
                <Button type="button" variant="outline" onClick={() => setPayTarget(null)} className="flex-1 h-11 rounded-xl font-bold">Annuler</Button>
                <Button type="submit" className="flex-1 h-11 rounded-xl font-bold gap-2"><Wallet className="w-4 h-4" />Encaisser</Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {historyTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setHistoryTarget(null)} />
          <Card className="relative w-full max-w-md shadow-2xl border-border/50 max-h-[80vh] overflow-y-auto">
            <div className="p-6 border-b border-border/50 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black">Historique des paiements</h2>
                <p className="text-xs text-muted-foreground font-medium mt-0.5">{historyTarget.name}</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setHistoryTarget(null)} className="rounded-full"><X className="w-5 h-5" /></Button>
            </div>
            <div className="p-6 space-y-3">
              {paymentsLoading && <p className="text-sm text-muted-foreground text-center py-4">Chargement...</p>}
              {!paymentsLoading && payments.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">Aucun paiement enregistré pour ce client.</p>
              )}
              {payments.map(p => (
                <div key={p.id} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-muted/30">
                  <div className="min-w-0">
                    <p className="font-bold text-sm">{p.amount.toLocaleString()} FCFA</p>
                    <p className="text-[13px] text-muted-foreground">
                      {new Date(p.createdAt).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })} — encaissé par {p.userName}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[12px] text-muted-foreground uppercase font-bold">Solde après</p>
                    <p className="text-xs font-bold">{p.balanceAfter.toLocaleString()} FCFA</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
